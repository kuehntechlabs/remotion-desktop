<h1 align="center">Remotion Desktop</h1>

<p align="center">
  A desktop workspace for <a href="https://www.remotion.dev/">Remotion</a> projects.<br/>
  Create projects, manage assets, and preview renders from one app.
</p>

<p align="center">
  Built with Electron, React, TypeScript, Vite, and Tailwind CSS.
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="#updates">Updates</a> &middot;
  <a href="#release-workflow">Release Workflow</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#license">License</a>
</p>

---

## Features

### Project Management

Create and manage multiple Remotion projects from one dashboard. Each project is stored with metadata in a local config file and can be reopened quickly.

### Project Scaffolding

Scaffold a new Remotion project directly from the app with `npx create-video@latest`, install dependencies automatically, and optionally seed the new project with media files.

New projects also preinstall common integrations: `mapbox-gl`, `@turf/turf`, `@types/mapbox-gl`, `@remotion/animated-emoji`, `@remotion/animation-utils`, `@remotion/gif`, `@remotion/fonts`, and `@remotion/google-fonts`.

### Embedded Live Preview

When you open a project, the app starts the Remotion dev server on a free port and embeds the preview inside the desktop UI.

### Asset Browser and File Previews

Manage files in `public/` with drag-and-drop style import and rich previews:

| File Type | Behavior |
|-----------|----------|
| Images | Inline image preview |
| Video | Inline video player |
| Audio | Inline audio player |
| PDF | Embedded PDF preview |
| Text/Code/HTML | In-app text or HTML preview |
| Office files | Open with system default app |

Hidden and temporary files are filtered automatically.

### Render Output Tracking

The app watches the `out/` directory and refreshes render results automatically when files change.

### System Integrations

Open projects in Claude and Finder (or the system file explorer), and open unsupported files with their default OS application.

---

## Installation

### Prerequisites

- Node.js 20+
- npm 10+

### Run from source

```bash
git clone https://github.com/kuehntechlabs/remotion-desktop.git
cd remotion-desktop
npm install
npm run dev
```

---

## Development

### Available scripts

- `npm run dev` - Start the Vite development server
- `npm run preview` - Preview the production build
- `npm run build` - Type check, bundle, and package with Electron Builder

### Production build

```bash
npm run build
```

---

## Updates

The app checks for updates automatically on startup.

If a newer version is found, a popup appears where users can:

1. Start downloading the update
2. Install it with one click after download (app restarts)

Updates work in packaged builds and require published GitHub releases.

---

## Release Workflow

GitHub Actions is configured to release from tags and automate tagging on `main`:

1. Update `version` in `package.json` and merge/push to `main`
2. Workflow `Tag Version on Main` creates `v<version>` if missing
3. Workflow `Release Build` runs on that tag and publishes:
   - `RemotionDesktop.dmg` (macOS arm64 only)
   - `RemotionDesktop.exe` (Windows x64)

---

## Architecture

Remotion Desktop uses a standard Electron multi-process setup:

```text
Renderer (React UI)
  -> requests actions via preload API
Preload (contextBridge)
  -> forwards IPC calls
Main (Electron)
  -> project config, scaffolding, dev server, file watching, OS integration
```

### Key folders

```text
electron/
  main.ts      # IPC handlers, process and filesystem orchestration
  preload.ts   # Secure API exposed to renderer
src/
  App.tsx
  pages/
    ProjectSelector.tsx
    CreateProject.tsx
    Dashboard.tsx
```

---

## License

This project is licensed under the [MIT License](LICENSE).
