import { app, dialog, shell, session, BrowserWindow } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { openDatabase } from './db/database';
import { registerIpcHandlers } from './ipc';
import { PetService } from './pet/petService';
import { SessionManager } from './session/sessionManager';

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: 'Project: Ascend',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer is untrusted web content: no Node access, isolated from the preload.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Links that try to open a new window go to the system browser, but only over https.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https:')) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  // The app is a single page, so block any navigation away from the page it loaded.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.projectascend.app');

  // Deny every permission request (camera, microphone, location...) until a feature needs one.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Open the database before any window exists, so the renderer never calls a missing handler.
  try {
    const db = openDatabase(join(app.getPath('userData'), 'ascend.db'));

    // Pushes a message to every open window.
    const broadcast = (channel: string, payload: unknown): void => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(channel, payload);
        }
      }
    };

    // The pet hears about every XP payout, and the windows hear about the pet.
    const pets = new PetService(db, (update) => broadcast('pet:changed', update));

    // Every change to the session is pushed to the windows, which show the countdown. When a
    // session ends, it pays its XP to the pet.
    const sessions = new SessionManager(
      db,
      Date.now,
      (state) => broadcast('session:changed', state),
      (id, state) => pets.awardSession(id, state)
    );

    // A session left unfinished by a crash or a quit is closed before anything else runs.
    sessions.recover();
    registerIpcHandlers(db, sessions, pets);

    // The session clock ticks once a second. A failed tick is logged and the next one retries.
    const ticker = setInterval(() => {
      try {
        sessions.tick();
      } catch (error) {
        console.error('Session tick failed', error);
      }
    }, 1000);

    app.on('will-quit', () => {
      clearInterval(ticker);
      sessions.flush();
      db.close();
    });
  } catch (error) {
    dialog.showErrorBox('Project: Ascend', `The database could not be opened.\n\n${String(error)}`);
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
