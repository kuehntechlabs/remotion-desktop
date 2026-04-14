import { useEffect, useState, useRef } from "react";
import type { Project, Asset } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFileSize } from "@/lib/utils";
import {
  ArrowLeft,
  Play,
  Square,
  Globe,
  Plus,
  Trash2,
  FileVideo,
  FileImage,
  FileAudio,
  File,
  FolderOpen,
  Loader2,
  ExternalLink,
  X,
  Film,
} from "lucide-react";

interface Props {
  project: Project;
  onBack: () => void;
}

function AssetIcon({ type }: { type: Asset["type"] }) {
  switch (type) {
    case "image":
      return <FileImage className="h-5 w-5" />;
    case "video":
      return <FileVideo className="h-5 w-5" />;
    case "audio":
      return <FileAudio className="h-5 w-5" />;
    default:
      return <File className="h-5 w-5" />;
  }
}

export default function Dashboard({ project, onBack }: Props) {
  const [serverRunning, setServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const webviewRef = useRef<HTMLWebViewElement>(null);

  useEffect(() => {
    checkServerStatus();
    loadAssets();

    const cleanup = window.remotion.onDevServerStopped((path) => {
      if (path === project.path) {
        setServerRunning(false);
        setServerPort(null);
        setShowBrowser(false);
      }
    });

    return cleanup;
  }, [project.path]);

  async function checkServerStatus() {
    const status = await window.remotion.getDevServerStatus(project.path);
    setServerRunning(status.running);
    if (status.port) setServerPort(status.port);
  }

  async function loadAssets() {
    const a = await window.remotion.getAssets(project.path);
    setAssets(a);

    for (const asset of a) {
      if (asset.type === "image") {
        const dataUrl = await window.remotion.getAssetDataUrl(asset.path);
        if (dataUrl) {
          setThumbnails((prev) => ({ ...prev, [asset.name]: dataUrl }));
        }
      }
    }
  }

  async function handleToggleServer() {
    if (serverRunning) {
      await window.remotion.stopDevServer(project.path);
      setServerRunning(false);
      setServerPort(null);
      setShowBrowser(false);
    } else {
      setStarting(true);
      try {
        const port = await window.remotion.startDevServer(project.path);
        setServerRunning(true);
        setServerPort(port);
      } catch (err) {
        console.error("Dev-Server konnte nicht gestartet werden:", err);
      }
      setStarting(false);
    }
  }

  async function handleAddAssets() {
    const files = await window.remotion.pickFiles([
      {
        name: "Mediendateien",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "svg",
          "bmp",
          "mp4",
          "webm",
          "mov",
          "avi",
          "mkv",
          "mp3",
          "wav",
          "ogg",
          "aac",
          "flac",
          "json",
          "csv",
          "txt",
          "lottie",
        ],
      },
    ]);
    if (files.length > 0) {
      await window.remotion.copyToPublic(project.path, files);
      loadAssets();
    }
  }

  async function handleDeleteAsset(name: string) {
    await window.remotion.deleteAsset(project.path, name);
    setAssets((prev) => prev.filter((a) => a.name !== name));
    setThumbnails((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleOpenClaude() {
    await window.remotion.openInClaude(project.path);
  }

  async function handleOpenFolder() {
    await window.remotion.openInFinder(project.path);
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Titelleiste */}
      <div className="h-12 flex items-center px-4 shrink-0 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Projekte
        </Button>
        <div className="flex-1 text-center">
          <span className="text-sm font-medium">{project.name}</span>
        </div>
        <div className="w-20" />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Seitenleiste */}
        <div className="w-80 border-r flex flex-col overflow-hidden">
          {/* Steuerung */}
          <div className="p-4 space-y-3 border-b">
            <Button
              onClick={handleToggleServer}
              disabled={starting}
              className="w-full"
              variant={serverRunning ? "destructive" : "default"}
              size="lg"
            >
              {starting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : serverRunning ? (
                <Square className="h-5 w-5 mr-2" />
              ) : (
                <Play className="h-5 w-5 mr-2" />
              )}
              {starting
                ? "Wird gestartet..."
                : serverRunning
                  ? "Server stoppen"
                  : "Server starten"}
            </Button>

            {serverRunning && serverPort && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowBrowser(!showBrowser)}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  {showBrowser ? "Vorschau ausblenden" : "Vorschau anzeigen"}
                </Button>
                <Badge variant="secondary" className="flex items-center">
                  :{serverPort}
                </Badge>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleOpenClaude}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Claude Code
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Dateien */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="font-semibold text-sm">Dateien</h3>
              <Button variant="ghost" size="sm" onClick={handleAddAssets}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto px-4 pb-4">
              {assets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">
                    Noch keine Dateien
                  </p>
                  <Button variant="outline" size="sm" onClick={handleAddAssets}>
                    <Plus className="h-4 w-4 mr-2" />
                    Dateien hinzufügen
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {assets.map((asset) => (
                    <div
                      key={asset.name}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent group"
                    >
                      {thumbnails[asset.name] ? (
                        <img
                          src={thumbnails[asset.name]}
                          alt={asset.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <AssetIcon type={asset.type} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{asset.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(asset.size)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDeleteAsset(asset.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hauptbereich - Browser oder Willkommen */}
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          {showBrowser && serverRunning && serverPort ? (
            <div className="w-full h-full relative">
              <div className="absolute top-2 right-2 z-10">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowBrowser(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <webview
                ref={webviewRef as any}
                src={`http://localhost:${serverPort}`}
                className="w-full h-full"
                style={{ display: "flex" }}
              />
            </div>
          ) : (
            <div className="text-center">
              <Film className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                {serverRunning ? "Server läuft" : "Starte den Dev-Server"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {serverRunning
                  ? 'Klicke auf "Vorschau anzeigen", um dein Remotion-Projekt im eingebetteten Browser zu sehen'
                  : "Klicke auf den Play-Button, um den Remotion-Entwicklungsserver zu starten und dein Projekt in der Vorschau zu sehen"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
