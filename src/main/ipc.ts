import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { is } from '@electron-toolkit/utils';
import { createGoal, listGoals } from './db/goals';
import { createTodo, deleteTodo, listTodos, moveTodo, setTodoDone, updateTodo } from './db/todos';
import type { PetService } from './pet/petService';
import type { SessionManager } from './session/sessionManager';

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
export function registerIpcHandlers(
  db: DatabaseSync,
  sessions: SessionManager,
  pets: PetService
): void {
  ipcMain.handle('goals:list', (event) => {
    assertTrusted(event);
    return listGoals(db);
  });

  ipcMain.handle('goals:create', (event, input: unknown) => {
    assertTrusted(event);
    return createGoal(db, input);
  });

  ipcMain.handle('todos:list', (event, goalId: unknown) => {
    assertTrusted(event);
    return listTodos(db, goalId);
  });

  ipcMain.handle('todos:create', (event, input: unknown) => {
    assertTrusted(event);
    return createTodo(db, input);
  });

  ipcMain.handle('todos:update', (event, input: unknown) => {
    assertTrusted(event);
    return updateTodo(db, input);
  });

  ipcMain.handle('todos:setDone', (event, input: unknown) => {
    assertTrusted(event);
    const todo = setTodoDone(db, input);
    // Finishing a task pays XP once. Checking it off again later pays nothing more.
    if (todo.done) {
      pets.awardTask(todo.id);
    }
    return todo;
  });

  ipcMain.handle('todos:move', (event, input: unknown) => {
    assertTrusted(event);
    return moveTodo(db, input);
  });

  ipcMain.handle('todos:delete', (event, id: unknown) => {
    assertTrusted(event);
    return deleteTodo(db, id);
  });

  ipcMain.handle('pet:get', (event) => {
    assertTrusted(event);
    return pets.get();
  });

  ipcMain.handle('pet:choose', (event, input: unknown) => {
    assertTrusted(event);
    return pets.choose(input);
  });

  ipcMain.handle('session:get', (event) => {
    assertTrusted(event);
    return sessions.current();
  });

  ipcMain.handle('session:create', (event, input: unknown) => {
    assertTrusted(event);
    return sessions.create(input);
  });

  ipcMain.handle('session:start', (event) => {
    assertTrusted(event);
    return sessions.start();
  });

  ipcMain.handle('session:pause', (event) => {
    assertTrusted(event);
    return sessions.pause();
  });

  ipcMain.handle('session:resume', (event) => {
    assertTrusted(event);
    return sessions.resume();
  });

  ipcMain.handle('session:abandon', (event) => {
    assertTrusted(event);
    return sessions.abandon();
  });
}
