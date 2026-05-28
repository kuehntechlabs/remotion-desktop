import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs";
import { ChildProcess, spawn, exec, execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import netModule from "net";

// macOS / Linux GUI launches inherit a minimal PATH from launchd, missing
// Homebrew, nvm, fnm, asdf etc. We do two things:
//   1. Copy the login shell's PATH into our env so child processes (git,
//      ffmpeg, etc.) can find tools the user expects.
//   2. Resolve absolute paths for npm/npx — version managers like nvm/fnm
//      sometimes don't export PATH cleanly for non-interactive `-ilc` calls,
//      so we also probe known install locations as a fallback.
let npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
let npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function listVersionedToolPaths(dir: string, suffix: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    const versions = fs.readdirSync(dir).sort().reverse();
    return versions.map((v) => path.join(dir, v, ...suffix));
  } catch {
    return [];
  }
}

function findToolViaLoginShell(tool: string): string | null {
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const stdout = execSync(
      `${shell} -ilc 'command -v ${tool} 2>/dev/null || true'`,
      { encoding: "utf-8", timeout: 5000 },
    );
    const candidate = stdout.trim().split("\n").pop()?.trim() || "";
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch {
    // ignore
  }
  return null;
}

function findToolInKnownLocations(tool: string): string | null {
  const home = process.env.HOME || "";
  const candidates: string[] = [];
  if (home) {
    candidates.push(
      ...listVersionedToolPaths(path.join(home, ".nvm", "versions", "node"), [
        "bin",
        tool,
      ]),
    );
    candidates.push(
      ...listVersionedToolPaths(
        path.join(home, ".local", "share", "fnm", "node-versions"),
        ["installation", "bin", tool],
      ),
    );
    candidates.push(
      ...listVersionedToolPaths(
        path.join(home, ".fnm", "node-versions"),
        ["installation", "bin", tool],
      ),
    );
    candidates.push(path.join(home, ".volta", "bin", tool));
    candidates.push(path.join(home, ".asdf", "shims", tool));
  }
  candidates.push(`/opt/homebrew/bin/${tool}`);
  candidates.push(`/usr/local/bin/${tool}`);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function fixPath() {
  if (process.platform === "win32") return;

  const shell = process.env.SHELL || "/bin/zsh";
  const delim = "__REMOTION_PATH_DELIM__";

  try {
    const stdout = execSync(
      `${shell} -ilc 'echo -n ${delim}; printenv PATH; echo -n ${delim}'`,
      { encoding: "utf-8", timeout: 5000 },
    );
    const parts = stdout.split(delim);
    if (parts.length >= 3) {
      const userPath = parts[1].trim();
      if (userPath) process.env.PATH = userPath;
    }
  } catch {
    // Best effort — keep whatever PATH we had.
  }

  const npm =
    findToolViaLoginShell("npm") || findToolInKnownLocations("npm");
  if (npm) {
    npmCommand = npm;
    const npmDir = path.dirname(npm);
    const siblingNpx = path.join(npmDir, "npx");
    npxCommand = fs.existsSync(siblingNpx)
      ? siblingNpx
      : findToolViaLoginShell("npx") ||
        findToolInKnownLocations("npx") ||
        npxCommand;

    // Make sure child processes can resolve node (npm's shebang is
    // `#!/usr/bin/env node`, so node must be on PATH for npm to launch).
    const segments = (process.env.PATH || "").split(":");
    if (!segments.includes(npmDir)) {
      process.env.PATH = [npmDir, process.env.PATH].filter(Boolean).join(":");
    }
  }

  console.log(`[remotion] npm: ${npmCommand}`);
  console.log(`[remotion] npx: ${npxCommand}`);
  console.log(`[remotion] PATH: ${process.env.PATH}`);
}

fixPath();

// Types
interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

interface AppConfig {
  projects: Project[];
  lastOpenedProject: string | null;
}

interface UpdaterActionResult {
  ok: boolean;
  message?: string;
}

interface ProjectTargetCheck {
  safeDirName: string;
  projectPath: string;
  exists: boolean;
}

type UpdaterEventPayload =
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "error"; message: string };

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
const devServerPorts: Map<string, number> = new Map();

// On Windows, child.kill() does not reliably terminate npm's grandchildren
// (the actual node / remotion processes), leaving the dev-server port stuck.
// taskkill /T walks the process tree.
function killDevServerProcess(child: ChildProcess) {
  if (process.platform === "win32" && child.pid !== undefined) {
    exec(`taskkill /pid ${child.pid} /t /f`);
  } else {
    child.kill();
  }
}

const defaultScaffoldPackages = [
  "mapbox-gl",
  "@turf/turf",
  "@types/mapbox-gl",
  "@remotion/animated-emoji",
  "@remotion/animation-utils",
  "@remotion/gif",
  "@remotion/fonts",
  "@remotion/google-fonts",
];

function resolveDockIconPath(): string | null {
  const candidates = [
    path.join(__dirname, "../build/icon.png"),
    path.join(process.cwd(), "build/icon.png"),
    path.join(__dirname, "../public/icons/icon-512.png"),
    path.join(process.cwd(), "public/icons/icon-512.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function applyDockIcon() {
  if (process.platform !== "darwin") return;

  const iconPath = resolveDockIconPath();
  if (!iconPath) return;

  app.dock?.setIcon(iconPath);
}

// Directory watchers
const dirWatchers: Map<string, fs.FSWatcher> = new Map();

// Find a free port (probe on loopback only to match where the dev server binds)
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = netModule.createServer();
    server.listen(0, "127.0.0.1", () => {
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

// Async listeners (child process 'close', fs watchers, updater events) can fire
// after the window is destroyed during app quit. `?.` only guards against null —
// not against a window whose webContents has already been torn down.
function sendToRenderer(channel: string, ...args: unknown[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (wc.isDestroyed()) return;
  wc.send(channel, ...args);
}

function sendUpdaterEvent(payload: UpdaterEventPayload) {
  sendToRenderer("updater-event", payload);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterEvent({ type: "checking-for-update" });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterEvent({ type: "update-available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdaterEvent({ type: "update-not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent({
      type: "download-progress",
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdaterEvent({ type: "update-downloaded", version: info.version });
  });

  autoUpdater.on("error", (error) => {
    sendUpdaterEvent({
      type: "error",
      message:
        error instanceof Error ? error.message : "Unknown updater error",
    });
  });
}

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

  mainWindow.on("closed", () => {
    mainWindow = null;
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

function toSafeProjectDirName(projectName: string): string {
  const sanitized = projectName
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9@._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return sanitized || "remotion-project";
}

function runNpmCommand(
  projectPath: string,
  args: string[],
  commandLabel: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: projectPath,
      stdio: "pipe",
      env: { ...process.env },
    });

    let stderr = "";
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${commandLabel} failed with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `${commandLabel} konnte nicht gestartet werden: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
  });
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
    return new Promise<string>((resolve, reject) => {
      const safeDirName = toSafeProjectDirName(projectName);
      const projectPath = path.join(parentDir, safeDirName);

      if (fs.existsSync(projectPath)) {
        reject(
          new Error(
            `Der Ordner "${projectPath}" existiert bereits. Bitte wähle einen anderen Namen.`,
          ),
        );
        return;
      }

      const child = spawn(
        npxCommand,
        [
          "create-video@latest",
          "--yes",
          "--blank",
          "--no-tailwind",
          projectPath,
        ],
        {
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
          if (!fs.existsSync(projectPath)) {
            reject(
              new Error(
                `Projektordner wurde nicht gefunden: ${projectPath}. Bitte prüfe den Projektnamen.`,
              ),
            );
            return;
          }
          resolve(projectPath);
        } else {
          reject(
            new Error(`Scaffold fehlgeschlagen (Code ${code}): ${stderr}`),
          );
        }
      });

      child.on("error", (error) => {
        reject(
          new Error(
            `Scaffold konnte nicht gestartet werden: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      });
    });
  },
);

ipcMain.handle(
  "check-project-target",
  (_event, parentDir: string, projectName: string): ProjectTargetCheck => {
    const safeDirName = toSafeProjectDirName(projectName);
    const projectPath = path.join(parentDir, safeDirName);
    return {
      safeDirName,
      projectPath,
      exists: fs.existsSync(projectPath),
    };
  },
);

ipcMain.handle("install-dependencies", async (_event, projectPath: string) => {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Projektordner nicht gefunden: ${projectPath}`);
  }

  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Kein package.json im Projektordner gefunden: ${projectPath}`);
  }

  await runNpmCommand(projectPath, ["install"], "npm install");

  await runNpmCommand(
    projectPath,
    ["install", "--save-exact", ...defaultScaffoldPackages],
    "npm install --save-exact (Integrationen)",
  );
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
    killDevServerProcess(existing);
    devServers.delete(projectPath);
    devServerPorts.delete(projectPath);
  }

  const port = await findFreePort();

  const child = spawn(
    npmCommand,
    [
      "run",
      "dev",
      "--",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--no-open",
    ],
    {
      cwd: projectPath,
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    },
  );

  devServers.set(projectPath, child);

  const startupError = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) => {
      devServers.delete(projectPath);
      devServerPorts.delete(projectPath);
      const message =
        error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
          ? `npm wurde nicht gefunden (versucht: ${npmCommand}). Bitte installiere Node.js (https://nodejs.org) und starte die App neu.`
          : `Dev-Server konnte nicht gestartet werden: ${error instanceof Error ? error.message : String(error)}`;
      reject(new Error(message));
    });
  });

  child.on("close", () => {
    devServers.delete(projectPath);
    devServerPorts.delete(projectPath);
    sendToRenderer("dev-server-stopped", projectPath);
  });

  // Wait for the server to actually be ready before returning
  await Promise.race([waitForPort(port), startupError]);

  devServerPorts.set(projectPath, port);
  return port;
});

ipcMain.handle("stop-dev-server", (_event, projectPath: string) => {
  const child = devServers.get(projectPath);
  if (child) {
    killDevServerProcess(child);
    devServers.delete(projectPath);
    devServerPorts.delete(projectPath);
  }
});

ipcMain.handle("get-dev-server-status", (_event, projectPath: string) => {
  const isRunning = devServers.has(projectPath);
  return {
    running: isRunning,
    port: isRunning ? devServerPorts.get(projectPath) : undefined,
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

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("check-for-updates", async (): Promise<UpdaterActionResult> => {
  if (!app.isPackaged) {
    const message = "Updates are only available in packaged builds.";
    sendUpdaterEvent({ type: "error", message });
    return { ok: false, message };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check for updates";
    sendUpdaterEvent({ type: "error", message });
    return { ok: false, message };
  }
});

ipcMain.handle("download-update", async (): Promise<UpdaterActionResult> => {
  if (!app.isPackaged) {
    const message = "Updates are only available in packaged builds.";
    sendUpdaterEvent({ type: "error", message });
    return { ok: false, message };
  }

  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download update";
    sendUpdaterEvent({ type: "error", message });
    return { ok: false, message };
  }
});

ipcMain.handle(
  "quit-and-install-update",
  (): UpdaterActionResult => {
    if (!app.isPackaged) {
      const message = "Updates are only available in packaged builds.";
      sendUpdaterEvent({ type: "error", message });
      return { ok: false, message };
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall();
    });
    return { ok: true };
  },
);

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
      sendToRenderer("directory-changed", dirPath, label);
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
  setupAutoUpdater();
  applyDockIcon();
  createWindow();
});

app.on("window-all-closed", () => {
  // Kill all dev servers on quit
  for (const [, child] of devServers) {
    killDevServerProcess(child);
  }
  devServers.clear();
  devServerPorts.clear();

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
