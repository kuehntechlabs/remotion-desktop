import { contextBridge, ipcRenderer } from "electron";

export interface Asset {
  name: string;
  path: string;
  size: number;
  type: "image" | "video" | "audio" | "other";
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  devPort: number | null;
}

export interface UpdaterActionResult {
  ok: boolean;
  message?: string;
}

export type UpdaterEvent =
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "error"; message: string };

const api = {
  // Projects
  getProjects: (): Promise<Project[]> => ipcRenderer.invoke("get-projects"),
  createProject: (name: string, path: string): Promise<Project> =>
    ipcRenderer.invoke("create-project", name, path),
  deleteProject: (id: string): Promise<void> =>
    ipcRenderer.invoke("delete-project", id),
  setLastOpened: (id: string): Promise<void> =>
    ipcRenderer.invoke("set-last-opened", id),

  // File system
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("pick-folder"),
  pickFiles: (
    filters: { name: string; extensions: string[] }[],
  ): Promise<string[]> => ipcRenderer.invoke("pick-files", filters),
  copyToPublic: (projectPath: string, files: string[]): Promise<void> =>
    ipcRenderer.invoke("copy-to-public", projectPath, files),
  getAssets: (projectPath: string): Promise<Asset[]> =>
    ipcRenderer.invoke("get-assets", projectPath),
  getRenders: (projectPath: string): Promise<Asset[]> =>
    ipcRenderer.invoke("get-renders", projectPath),
  deleteAsset: (projectPath: string, filename: string): Promise<void> =>
    ipcRenderer.invoke("delete-asset", projectPath, filename),
  getAssetDataUrl: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("get-asset-data-url", filePath),

  // Remotion
  scaffoldProject: (parentDir: string, projectName: string): Promise<string> =>
    ipcRenderer.invoke("scaffold-project", parentDir, projectName),
  installDependencies: (path: string): Promise<void> =>
    ipcRenderer.invoke("install-dependencies", path),
  startDevServer: (projectPath: string): Promise<number> =>
    ipcRenderer.invoke("start-dev-server", projectPath),
  stopDevServer: (projectPath: string): Promise<void> =>
    ipcRenderer.invoke("stop-dev-server", projectPath),
  getDevServerStatus: (
    projectPath: string,
  ): Promise<{ running: boolean; port?: number }> =>
    ipcRenderer.invoke("get-dev-server-status", projectPath),

  // System
  openInClaude: (projectPath: string): Promise<void> =>
    ipcRenderer.invoke("open-in-claude", projectPath),
  openInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke("open-in-finder", path),
  openWithSystem: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("open-with-system", filePath),
  readFileText: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("read-file-text", filePath),
  getPlatform: (): Promise<string> => ipcRenderer.invoke("get-platform"),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: (): Promise<UpdaterActionResult> =>
    ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: (): Promise<UpdaterActionResult> =>
    ipcRenderer.invoke("download-update"),
  quitAndInstallUpdate: (): Promise<UpdaterActionResult> =>
    ipcRenderer.invoke("quit-and-install-update"),

  // Directory watching
  watchDirectory: (dirPath: string, label: string): Promise<void> =>
    ipcRenderer.invoke("watch-directory", dirPath, label),
  unwatchDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke("unwatch-directory", dirPath),

  // Events
  onDevServerStopped: (callback: (projectPath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, projectPath: string) =>
      callback(projectPath);
    ipcRenderer.on("dev-server-stopped", handler);
    return () => ipcRenderer.removeListener("dev-server-stopped", handler);
  },
  onDirectoryChanged: (callback: (dirPath: string, label: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      dirPath: string,
      label: string,
    ) => callback(dirPath, label);
    ipcRenderer.on("directory-changed", handler);
    return () => ipcRenderer.removeListener("directory-changed", handler);
  },
  onUpdaterEvent: (callback: (payload: UpdaterEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: UpdaterEvent,
    ) => callback(payload);
    ipcRenderer.on("updater-event", handler);
    return () => ipcRenderer.removeListener("updater-event", handler);
  },
};

contextBridge.exposeInMainWorld("remotion", api);
