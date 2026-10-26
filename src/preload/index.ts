import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Goal, NewGoal } from '../shared/goal';
import type { NewSession, SessionState } from '../shared/session';
import type { MoveDirection, NewTodo, Todo, TodoChanges } from '../shared/todo';

// The only surface the renderer can reach. Add one typed function per feature
// instead of exposing Electron's IPC directly.
const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  goals: {
    list: (): Promise<Goal[]> => ipcRenderer.invoke('goals:list'),
    create: (input: NewGoal): Promise<Goal> => ipcRenderer.invoke('goals:create', input)
  },
  todos: {
    list: (goalId: number): Promise<Todo[]> => ipcRenderer.invoke('todos:list', goalId),
    create: (input: NewTodo): Promise<Todo> => ipcRenderer.invoke('todos:create', input),
    update: (input: TodoChanges & { id: number }): Promise<Todo> =>
      ipcRenderer.invoke('todos:update', input),
    setDone: (input: { id: number; done: boolean }): Promise<Todo> =>
      ipcRenderer.invoke('todos:setDone', input),
    move: (input: { id: number; direction: MoveDirection }): Promise<Todo[]> =>
      ipcRenderer.invoke('todos:move', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('todos:delete', id)
  },
  session: {
    // The unfinished session, or null if there is none.
    get: (): Promise<SessionState | null> => ipcRenderer.invoke('session:get'),
    create: (input: NewSession): Promise<SessionState> =>
      ipcRenderer.invoke('session:create', input),
    start: (): Promise<SessionState> => ipcRenderer.invoke('session:start'),
    pause: (): Promise<SessionState> => ipcRenderer.invoke('session:pause'),
    resume: (): Promise<SessionState> => ipcRenderer.invoke('session:resume'),
    abandon: (): Promise<SessionState> => ipcRenderer.invoke('session:abandon'),
    // Calls back whenever the session changes. Returns a function that stops listening.
    onChange: (callback: (state: SessionState) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, state: SessionState): void => callback(state);
      ipcRenderer.on('session:changed', listener);
      return () => {
        ipcRenderer.removeListener('session:changed', listener);
      };
    }
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
