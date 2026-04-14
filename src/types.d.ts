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
  deleteAsset(projectPath: string, filename: string): Promise<void>;
  getAssetDataUrl(filePath: string): Promise<string | null>;
  scaffoldProject(parentDir: string, projectName: string): Promise<void>;
  installDependencies(path: string): Promise<void>;
  startDevServer(projectPath: string): Promise<number>;
  stopDevServer(projectPath: string): Promise<void>;
  getDevServerStatus(
    projectPath: string,
  ): Promise<{ running: boolean; port?: number }>;
  openInClaude(projectPath: string): Promise<void>;
  openInFinder(path: string): Promise<void>;
  getPlatform(): Promise<string>;
  onDevServerStopped(callback: (projectPath: string) => void): () => void;
}

declare global {
  interface Window {
    remotion: RemotionAPI;
  }
}
