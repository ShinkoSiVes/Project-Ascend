import { contextBridge, ipcRenderer } from 'electron';
import type { Goal, NewGoal } from '../shared/goal';

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
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
