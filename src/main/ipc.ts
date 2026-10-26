import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { is } from '@electron-toolkit/utils';
import { createGoal, listGoals } from './db/goals';

// Only the app's own page may call the main process, never a frame that navigated elsewhere.
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) {
    return false;
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (is.dev && devUrl) {
    return new URL(url).origin === new URL(devUrl).origin;
  }
  return url.startsWith('file://');
}

function assertTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('Untrusted sender');
  }
}

// Registers every channel the renderer can call. Add one handler per feature here.
export function registerIpcHandlers(db: DatabaseSync): void {
  ipcMain.handle('goals:list', (event) => {
    assertTrusted(event);
    return listGoals(db);
  });

  ipcMain.handle('goals:create', (event, input: unknown) => {
    assertTrusted(event);
    return createGoal(db, input);
  });
}
