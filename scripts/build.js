// Local build entry point.
// Loads .env if present (for code-signing credentials), then runs
// the renderer build followed by electron-builder.
//
// CI does not use this script — see npm run build:ci, which expects
// the env to come from GitHub secrets already.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
  console.log("[build] Loaded credentials from .env");
} else {
  console.log(
    "[build] No .env found — building unsigned (copy .env.example to .env to enable signing)",
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build:renderer"]);
run("npx", ["electron-builder"]);
