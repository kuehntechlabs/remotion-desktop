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
  deleteAsset: (projectPath: string, filename: string): Promise<void> =>
    ipcRenderer.invoke("delete-asset", projectPath, filename),
  getAssetDataUrl: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("get-asset-data-url", filePath),

  // Remotion
  scaffoldProject: (parentDir: string, projectName: string): Promise<void> =>
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
  getPlatform: (): Promise<string> => ipcRenderer.invoke("get-platform"),

  // Events
  onDevServerStopped: (callback: (projectPath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, projectPath: string) =>
      callback(projectPath);
    ipcRenderer.on("dev-server-stopped", handler);
    return () => ipcRenderer.removeListener("dev-server-stopped", handler);
  },
};

contextBridge.exposeInMainWorld("remotion", api);
