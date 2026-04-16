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

export interface ProjectTargetCheck {
  safeDirName: string;
  projectPath: string;
  exists: boolean;
}

export type UpdaterEvent =
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "error"; message: string };

interface RemotionAPI {
  getProjects(): Promise<Project[]>;
  createProject(name: string, path: string): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  setLastOpened(id: string): Promise<void>;
  pickFolder(): Promise<string | null>;
  pickFiles(
    filters: { name: string; extensions: string[] }[],
  ): Promise<string[]>;
  copyToPublic(projectPath: string, files: string[]): Promise<void>;
  getAssets(projectPath: string): Promise<Asset[]>;
  getRenders(projectPath: string): Promise<Asset[]>;
  deleteAsset(projectPath: string, filename: string): Promise<void>;
  getAssetDataUrl(filePath: string): Promise<string | null>;
  scaffoldProject(parentDir: string, projectName: string): Promise<string>;
  checkProjectTarget(
    parentDir: string,
    projectName: string,
  ): Promise<ProjectTargetCheck>;
  installDependencies(path: string): Promise<void>;
  startDevServer(projectPath: string): Promise<number>;
  stopDevServer(projectPath: string): Promise<void>;
  getDevServerStatus(
    projectPath: string,
  ): Promise<{ running: boolean; port?: number }>;
  openInClaude(projectPath: string): Promise<void>;
  openInFinder(path: string): Promise<void>;
  openWithSystem(filePath: string): Promise<string>;
  readFileText(filePath: string): Promise<string | null>;
  getPlatform(): Promise<string>;
  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<UpdaterActionResult>;
  downloadUpdate(): Promise<UpdaterActionResult>;
  quitAndInstallUpdate(): Promise<UpdaterActionResult>;
  watchDirectory(dirPath: string, label: string): Promise<void>;
  unwatchDirectory(dirPath: string): Promise<void>;
  onDevServerStopped(callback: (projectPath: string) => void): () => void;
  onDirectoryChanged(
    callback: (dirPath: string, label: string) => void,
  ): () => void;
  onUpdaterEvent(callback: (payload: UpdaterEvent) => void): () => void;
}

declare global {
  interface Window {
    remotion: RemotionAPI;
  }
}
