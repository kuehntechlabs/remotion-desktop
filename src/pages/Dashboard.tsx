import { useEffect, useState, useRef, useCallback } from "react";
import type { Project, Asset } from "../types";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileVideo,
  FileImage,
  FileAudio,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileType,
  File,
  FolderOpen,
  Loader2,
  ExternalLink,
  X,
  Download,
} from "lucide-react";

interface Props {
  project: Project;
  onBack: () => void;
}

// File extension categories
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".aac", ".flac"];
const TEXT_EXTS = [".txt", ".md", ".csv", ".json", ".log"];
const CODE_EXTS = [".html", ".htm", ".css", ".js", ".ts", ".jsx", ".tsx"];
const PDF_EXTS = [".pdf"];
const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm"];
const WORD_EXTS = [".docx", ".doc"];
const PPT_EXTS = [".pptx", ".ppt"];

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

type PreviewCategory =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "html"
  | "pdf"
  | "excel"
  | "word"
  | "powerpoint"
  | "other";

function getPreviewCategory(name: string): PreviewCategory {
  const ext = getFileExt(name);
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if ([".html", ".htm"].includes(ext)) return "html";
  if (
    TEXT_EXTS.includes(ext) ||
    CODE_EXTS.filter((e) => ![".html", ".htm"].includes(e)).includes(ext)
  )
    return "text";
  if (PDF_EXTS.includes(ext)) return "pdf";
  if (EXCEL_EXTS.includes(ext)) return "excel";
  if (WORD_EXTS.includes(ext)) return "word";
  if (PPT_EXTS.includes(ext)) return "powerpoint";
  return "other";
}

function AssetIcon({ type, name }: { type: Asset["type"]; name?: string }) {
  if (name) {
    const cat = getPreviewCategory(name);
    switch (cat) {
      case "text":
        return <FileText className="h-5 w-5" />;
      case "html":
        return <FileCode className="h-5 w-5" />;
      case "pdf":
        return <FileType className="h-5 w-5" />;
      case "excel":
        return <FileSpreadsheet className="h-5 w-5" />;
      case "word":
        return <FileText className="h-5 w-5" />;
      case "powerpoint":
        return <FileImage className="h-5 w-5" />;
    }
  }
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

// Microsoft Office SVG icons (simplified brand marks)
function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="4" fill="#217346" />
      <path
        d="M8 8h6v4H8V8zm0 6h6v4H8v-4zm0 6h6v4H8v-4zm8-12h8v4h-8V8zm0 6h8v4h-8v-4zm0 6h8v4h-8v-4z"
        fill="#fff"
        opacity="0.9"
      />
      <text
        x="11"
        y="20"
        fontSize="12"
        fontWeight="bold"
        fill="#fff"
        textAnchor="middle"
      >
        X
      </text>
    </svg>
  );
}

function WordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="4" fill="#2B579A" />
      <text
        x="16"
        y="21"
        fontSize="14"
        fontWeight="bold"
        fill="#fff"
        textAnchor="middle"
      >
        W
      </text>
    </svg>
  );
}

function PowerPointIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="4" fill="#D24726" />
      <text
        x="16"
        y="21"
        fontSize="14"
        fontWeight="bold"
        fill="#fff"
        textAnchor="middle"
      >
        P
      </text>
    </svg>
  );
}

export default function Dashboard({ project, onBack }: Props) {
  const [serverRunning, setServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [renders, setRenders] = useState<Asset[]>([]);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const webviewRef = useRef<HTMLWebViewElement>(null);

  const loadAssets = useCallback(async () => {
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
  }, [project.path]);

  const loadRenders = useCallback(async () => {
    const r = await window.remotion.getRenders(project.path);
    setRenders(r);
  }, [project.path]);

  useEffect(() => {
    // Auto-start the dev server
    async function autoStart() {
      const status = await window.remotion.getDevServerStatus(project.path);
      if (status.running && status.port) {
        setServerRunning(true);
        setServerPort(status.port);
      } else {
        setStarting(true);
        try {
          const port = await window.remotion.startDevServer(project.path);
          setServerRunning(true);
          setServerPort(port);
        } catch (err) {
          console.error("Vorschau konnte nicht gestartet werden:", err);
        }
        setStarting(false);
      }
    }
    autoStart();
    loadAssets();
    loadRenders();

    const publicDir = `${project.path}/public`;
    const outDir = `${project.path}/out`;
    window.remotion.watchDirectory(publicDir, "public");
    window.remotion.watchDirectory(outDir, "out");

    const cleanupServerStopped = window.remotion.onDevServerStopped((path) => {
      if (path === project.path) {
        setServerRunning(false);
        setServerPort(null);
      }
    });

    const cleanupDirChanged = window.remotion.onDirectoryChanged(
      (_dirPath, label) => {
        if (label === "public") loadAssets();
        if (label === "out") loadRenders();
      },
    );

    return () => {
      cleanupServerStopped();
      cleanupDirChanged();
      window.remotion.unwatchDirectory(publicDir);
      window.remotion.unwatchDirectory(outDir);
    };
  }, [project.path, loadAssets, loadRenders]);

  async function handleBack() {
    await window.remotion.stopDevServer(project.path);
    onBack();
  }

  async function handleAddAssets() {
    const files = await window.remotion.pickFiles([
      {
        name: "Alle Dateien",
        extensions: ["*"],
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

  async function handleAssetClick(asset: Asset) {
    const cat = getPreviewCategory(asset.name);

    // Office files -> open with system app
    if (cat === "excel" || cat === "word" || cat === "powerpoint") {
      await window.remotion.openWithSystem(asset.path);
      return;
    }

    // Unknown files -> open with system default
    if (cat === "other") {
      await window.remotion.openWithSystem(asset.path);
      return;
    }

    // Text/HTML/code files -> read content
    if (cat === "text" || cat === "html") {
      const content = await window.remotion.readFileText(asset.path);
      setPreviewContent(content);
    } else {
      setPreviewContent(null);
    }

    setPreviewAsset(asset);
  }

  function closePreview() {
    setPreviewAsset(null);
    setPreviewContent(null);
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Titelleiste */}
      <div className="h-12 flex items-center px-4 pl-20 shrink-0 border-b titlebar-drag">
        <Button variant="ghost" size="sm" onClick={handleBack}>
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
          <div className="p-4 border-b">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleOpenClaude}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Claude Cowork
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable file sections */}
          <div className="flex-1 overflow-auto">
            {/* Dateien */}
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="font-semibold text-sm">Dateien</h3>
              <Button variant="ghost" size="sm" onClick={handleAddAssets}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-4 pb-2">
              {assets.length === 0 ? (
                <div className="text-center py-6">
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
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent group cursor-pointer"
                      onClick={() => handleAssetClick(asset)}
                    >
                      {thumbnails[asset.name] ? (
                        <img
                          src={thumbnails[asset.name]}
                          alt={asset.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <AssetIcon type={asset.type} name={asset.name} />
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAsset(asset.name);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Renders */}
            <div className="border-t">
              <div className="flex items-center justify-between p-4 pb-2">
                <h3 className="font-semibold text-sm">Renders</h3>
                {renders.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      window.remotion.openInFinder(`${project.path}/out`)
                    }
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="px-4 pb-4">
                {renders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Noch keine Renders
                  </p>
                ) : (
                  <div className="space-y-1">
                    {renders.map((render) => (
                      <div
                        key={render.path}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent group cursor-pointer"
                        onClick={() => handleAssetClick(render)}
                      >
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <AssetIcon type={render.type} name={render.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{render.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(render.size)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hauptbereich */}
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          {serverRunning && serverPort ? (
            <webview
              ref={webviewRef as any}
              src={`http://localhost:${serverPort}`}
              className="w-full h-full"
              style={{ display: "flex" }}
            />
          ) : (
            <div className="text-center">
              <Loader2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Vorschau wird geladen...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Asset Preview Overlay */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="relative bg-background rounded-lg shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <AssetIcon type={previewAsset.type} name={previewAsset.name} />
                <span className="text-sm font-medium truncate">
                  {previewAsset.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatFileSize(previewAsset.size)}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={closePreview}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] min-w-[400px]">
              <AssetPreviewContent
                asset={previewAsset}
                content={previewContent}
                thumbnail={thumbnails[previewAsset.name]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetPreviewContent({
  asset,
  content,
  thumbnail,
}: {
  asset: Asset;
  content: string | null;
  thumbnail?: string;
}) {
  const cat = getPreviewCategory(asset.name);
  const assetUrl = `local-asset://file/${encodeURIComponent(asset.path)}`;

  switch (cat) {
    case "image":
      return (
        <img
          src={thumbnail || assetUrl}
          alt={asset.name}
          className="max-w-full max-h-[75vh] object-contain rounded"
        />
      );

    case "video":
      return (
        <video
          src={assetUrl}
          controls
          autoPlay
          className="max-w-full max-h-[75vh] rounded"
        />
      );

    case "audio":
      return (
        <div className="flex flex-col items-center gap-6 p-8">
          <FileAudio className="h-16 w-16 text-muted-foreground/50" />
          <audio src={assetUrl} controls autoPlay className="w-80" />
        </div>
      );

    case "pdf":
      return (
        <iframe
          src={assetUrl}
          className="w-[80vw] h-[75vh] rounded border"
          title={asset.name}
        />
      );

    case "html":
      return (
        <iframe
          srcDoc={content || ""}
          className="w-[80vw] h-[75vh] rounded border bg-white"
          title={asset.name}
          sandbox="allow-scripts"
        />
      );

    case "text":
      return (
        <pre className="w-[70vw] max-h-[75vh] overflow-auto p-4 bg-muted rounded text-sm font-mono whitespace-pre-wrap break-words">
          {content || ""}
        </pre>
      );

    case "excel":
      return (
        <OfficeOpenButton
          icon={<ExcelIcon className="h-12 w-12" />}
          label="In Excel öffnen"
          filePath={asset.path}
        />
      );

    case "word":
      return (
        <OfficeOpenButton
          icon={<WordIcon className="h-12 w-12" />}
          label="In Word öffnen"
          filePath={asset.path}
        />
      );

    case "powerpoint":
      return (
        <OfficeOpenButton
          icon={<PowerPointIcon className="h-12 w-12" />}
          label="In PowerPoint öffnen"
          filePath={asset.path}
        />
      );

    default:
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <File className="h-16 w-16 text-muted-foreground/50" />
          <Button
            variant="outline"
            onClick={() => window.remotion.openWithSystem(asset.path)}
          >
            <Download className="h-4 w-4 mr-2" />
            Mit Standardprogramm öffnen
          </Button>
        </div>
      );
  }
}

function OfficeOpenButton({
  icon,
  label,
  filePath,
}: {
  icon: React.ReactNode;
  label: string;
  filePath: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      {icon}
      <Button
        variant="outline"
        size="lg"
        onClick={() => window.remotion.openWithSystem(filePath)}
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </div>
  );
}
