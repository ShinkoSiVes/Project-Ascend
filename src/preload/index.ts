import { contextBridge, ipcRenderer } from 'electron';
import type { Goal, NewGoal } from '../shared/goal';
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
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
