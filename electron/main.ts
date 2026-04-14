import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
} from "electron";
import path from "path";
import fs from "fs";
import { ChildProcess, spawn, exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import netModule from "net";

// Types
interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  devPort: number | null;
}

interface AppConfig {
  projects: Project[];
  lastOpenedProject: string | null;
}

// Config management
const CONFIG_DIR = path.join(app.getPath("home"), ".remotion-project");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): AppConfig {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig: AppConfig = { projects: [], lastOpenedProject: null };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(config: AppConfig) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Dev server process tracking
const devServers: Map<string, ChildProcess> = new Map();

// Directory watchers
const dirWatchers: Map<string, fs.FSWatcher> = new Map();

// Find a free port
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = netModule.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Could not find free port"));
      }
    });
    server.on("error", reject);
  });
}

// Main window
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// IPC Handlers

// Projects
ipcMain.handle("get-projects", () => {
  const config = readConfig();
  return config.projects;
});

ipcMain.handle(
  "create-project",
  (_event, name: string, projectPath: string) => {
    const config = readConfig();
    const project: Project = {
      id: uuidv4(),
      name,
      path: projectPath,
      createdAt: new Date().toISOString(),
      devPort: null,
    };
    config.projects.push(project);
    config.lastOpenedProject = project.id;
    writeConfig(config);
    return project;
  },
);

ipcMain.handle("delete-project", (_event, id: string) => {
  const config = readConfig();
  config.projects = config.projects.filter((p) => p.id !== id);
  if (config.lastOpenedProject === id) {
    config.lastOpenedProject = null;
  }
  writeConfig(config);
});

ipcMain.handle("set-last-opened", (_event, id: string) => {
  const config = readConfig();
  config.lastOpenedProject = id;
  writeConfig(config);
});

// File system
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("pick-files", async (_event, filters: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile", "multiSelections"],
    filters,
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle(
  "copy-to-public",
  async (_event, projectPath: string, files: string[]) => {
    const publicDir = path.join(projectPath, "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    for (const file of files) {
      const dest = path.join(publicDir, path.basename(file));
      fs.copyFileSync(file, dest);
    }
  },
);

function isHiddenOrTemp(name: string): boolean {
  if (name.startsWith(".")) return true;
  if (name.startsWith("~")) return true;
  if (name.startsWith("~$")) return true;
  if (name.endsWith(".tmp")) return true;
  if (name === "Thumbs.db" || name === ".DS_Store") return true;
  return false;
}

function classifyFile(ext: string): "image" | "video" | "audio" | "other" {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].includes(ext))
    return "image";
  if ([".mp4", ".webm", ".mov", ".avi", ".mkv"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".aac", ".flac"].includes(ext)) return "audio";
  return "other";
}

function scanDirectory(
  dir: string,
  prefix: string,
): {
  name: string;
  path: string;
  size: number;
  type: "image" | "video" | "audio" | "other";
}[] {
  if (!fs.existsSync(dir)) return [];
  const results: {
    name: string;
    path: string;
    size: number;
    type: "image" | "video" | "audio" | "other";
  }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isHiddenOrTemp(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const displayName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, displayName));
    } else {
      const stat = fs.statSync(fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      results.push({
        name: displayName,
        path: fullPath,
        size: stat.size,
        type: classifyFile(ext),
      });
    }
  }
  return results;
}

ipcMain.handle("get-assets", (_event, projectPath: string) => {
  return scanDirectory(path.join(projectPath, "public"), "");
});

ipcMain.handle(
  "delete-asset",
  (_event, projectPath: string, filename: string) => {
    const filePath = path.join(projectPath, "public", filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  },
);

ipcMain.handle("get-asset-data-url", (_event, filePath: string) => {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
  };
  const mime = mimeMap[ext];
  if (!mime) return null;
  const data = fs.readFileSync(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
});

// Remotion scaffolding — parentDir + name -> parentDir/name (must not exist)
ipcMain.handle(
  "scaffold-project",
  (_event, parentDir: string, projectName: string) => {
    return new Promise<void>((resolve, reject) => {
      const projectPath = path.join(parentDir, projectName);

      if (fs.existsSync(projectPath)) {
        reject(
          new Error(
            `Der Ordner "${projectPath}" existiert bereits. Bitte wähle einen anderen Namen.`,
          ),
        );
        return;
      }

      const child = spawn(
        "npx",
        [
          "create-video@latest",
          "--yes",
          "--blank",
          "--no-tailwind",
          projectPath,
        ],
        {
          shell: true,
          stdio: "pipe",
          env: { ...process.env },
        },
      );

      let stderr = "";
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Scaffold fehlgeschlagen (Code ${code}): ${stderr}`),
          );
        }
      });

      child.on("error", reject);
    });
  },
);

ipcMain.handle("install-dependencies", (_event, projectPath: string) => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["install"], {
      cwd: projectPath,
      shell: true,
      stdio: "pipe",
      env: { ...process.env },
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed with code ${code}`));
    });

    child.on("error", reject);
  });
});

// Wait until a port is accepting connections
function waitForPort(port: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = new netModule.Socket();
      socket
        .once("connect", () => {
          socket.destroy();
          resolve();
        })
        .once("error", () => {
          socket.destroy();
          if (Date.now() - start > timeout) {
            reject(new Error(`Server did not start within ${timeout}ms`));
          } else {
            setTimeout(tryConnect, 500);
          }
        });
      socket.connect(port, "127.0.0.1");
    }
    tryConnect();
  });
}

// Dev server
ipcMain.handle("start-dev-server", async (_event, projectPath: string) => {
  // Kill existing if running
  const existing = devServers.get(projectPath);
  if (existing) {
    existing.kill();
    devServers.delete(projectPath);
  }

  const port = await findFreePort();

  const child = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(port), "--no-open"],
    {
      cwd: projectPath,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );

  devServers.set(projectPath, child);

  child.on("close", () => {
    devServers.delete(projectPath);
    mainWindow?.webContents.send("dev-server-stopped", projectPath);
  });

  // Wait for the server to actually be ready before returning
  await waitForPort(port);

  // Update config with port
  const config = readConfig();
  const project = config.projects.find((p) => p.path === projectPath);
  if (project) {
    project.devPort = port;
    writeConfig(config);
  }

  return port;
});

ipcMain.handle("stop-dev-server", (_event, projectPath: string) => {
  const child = devServers.get(projectPath);
  if (child) {
    child.kill();
    devServers.delete(projectPath);
  }

  const config = readConfig();
  const project = config.projects.find((p) => p.path === projectPath);
  if (project) {
    project.devPort = null;
    writeConfig(config);
  }
});

ipcMain.handle("get-dev-server-status", (_event, projectPath: string) => {
  const isRunning = devServers.has(projectPath);
  const config = readConfig();
  const project = config.projects.find((p) => p.path === projectPath);
  return {
    running: isRunning,
    port: isRunning ? project?.devPort : undefined,
  };
});

// System
ipcMain.handle("open-in-claude", (_event, projectPath: string) => {
  if (process.platform === "darwin") {
    exec(`open -a "Claude" "${projectPath}"`);
  } else {
    // Windows - try common install locations
    exec(`start "" "Claude" "${projectPath}"`);
  }
});

ipcMain.handle("open-in-finder", (_event, filePath: string) => {
  shell.openPath(filePath);
});

ipcMain.handle("get-platform", () => {
  return process.platform;
});

// Get rendered output files from out/ directory (recursive)
ipcMain.handle("get-renders", (_event, projectPath: string) => {
  return scanDirectory(path.join(projectPath, "out"), "");
});

// Watch a directory for changes and notify the renderer
ipcMain.handle("watch-directory", (_event, dirPath: string, label: string) => {
  // Don't double-watch
  if (dirWatchers.has(dirPath)) return;
  if (!fs.existsSync(dirPath)) return;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const watcher = fs.watch(dirPath, { recursive: true }, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      mainWindow?.webContents.send("directory-changed", dirPath, label);
    }, 300);
  });

  dirWatchers.set(dirPath, watcher);
});

ipcMain.handle("unwatch-directory", (_event, dirPath: string) => {
  const watcher = dirWatchers.get(dirPath);
  if (watcher) {
    watcher.close();
    dirWatchers.delete(dirPath);
  }
});

// Register custom protocol for serving local asset files
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-asset",
    privileges: {
      bypassCSP: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

// Open file with system default application
ipcMain.handle("open-with-system", (_event, filePath: string) => {
  return shell.openPath(filePath);
});

// Read text file contents
ipcMain.handle("read-file-text", (_event, filePath: string) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
});

// App lifecycle
app.whenReady().then(() => {
  // Register protocol handler for local asset files
  protocol.handle("local-asset", (request) => {
    const filePath = decodeURIComponent(
      request.url.replace("local-asset://file/", ""),
    );
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  // Kill all dev servers on quit
  for (const [, child] of devServers) {
    child.kill();
  }
  devServers.clear();

  // Close all directory watchers
  for (const [, watcher] of dirWatchers) {
    watcher.close();
  }
  dirWatchers.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
