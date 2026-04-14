# Remotion Desktop

Desktop app to manage and preview Remotion video projects.

## Features

- Create and manage multiple Remotion projects
- Auto-starting dev server with embedded preview
- Asset management with drag-and-drop file import
  - Image, video, audio, PDF, HTML, text file previews in overlay
  - Office files (Excel, Word, PowerPoint) open in native apps
  - Recursive folder support inside `public/`
  - Hidden/temp files automatically filtered
- Rendered output browser (`out/` directory) with file watching
- File watchers auto-refresh asset and render lists on changes
- Media tile previews during project creation
- Open project in Claude Cowork or Finder

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
