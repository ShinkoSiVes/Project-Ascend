import { contextBridge } from 'electron';

// The only surface the renderer can reach. Add one typed function per feature
// instead of exposing Electron's IPC directly.
const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
