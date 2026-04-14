import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { ChildProcess, spawn, exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import net from "net";

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

// Find a free port
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
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

ipcMain.handle("get-assets", (_event, projectPath: string) => {
  const publicDir = path.join(projectPath, "public");
  if (!fs.existsSync(publicDir)) return [];

  const files = fs.readdirSync(publicDir);
  return files
    .filter((f) => !f.startsWith("."))
    .map((f) => {
      const filePath = path.join(publicDir, f);
      const stat = fs.statSync(filePath);
      const ext = path.extname(f).toLowerCase();
      const isImage = [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".svg",
        ".bmp",
      ].includes(ext);
      const isVideo = [".mp4", ".webm", ".mov", ".avi", ".mkv"].includes(ext);
      const isAudio = [".mp3", ".wav", ".ogg", ".aac", ".flac"].includes(ext);

      let type: "image" | "video" | "audio" | "other" = "other";
      if (isImage) type = "image";
      else if (isVideo) type = "video";
      else if (isAudio) type = "audio";

      return {
        name: f,
        path: filePath,
        size: stat.size,
        type,
      };
    });
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
      const socket = new net.Socket();
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
  shell.showItemInFolder(filePath);
});

ipcMain.handle("get-platform", () => {
  return process.platform;
});

// App lifecycle
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  // Kill all dev servers on quit
  for (const [, child] of devServers) {
    child.kill();
  }
  devServers.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
