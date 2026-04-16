import { useState, useEffect } from "react";
import type { Project } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FolderOpen,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  FileVideo,
  FileImage,
  FileAudio,
  File,
} from "lucide-react";

interface Props {
  onBack: () => void;
  onProjectCreated: (project: Project) => void;
}

type Step = "name" | "folder" | "assets" | "scaffolding";

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext))
    return <FileVideo className="h-4 w-4" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return <FileImage className="h-4 w-4" />;
  if (["mp3", "wav", "ogg", "aac", "flac"].includes(ext))
    return <FileAudio className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

export default function CreateProject({ onBack, onProjectCreated }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldStatus, setScaffoldStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetDirName, setTargetDirName] = useState("");
  const [targetExists, setTargetExists] = useState(false);
  const [checkingTarget, setCheckingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Load thumbnails for image/video files
  useEffect(() => {
    async function loadThumbnails() {
      for (const file of files) {
        if (thumbnails[file]) continue;
        const ext = file.split(".").pop()?.toLowerCase() || "";
        if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) {
          const dataUrl = await window.remotion.getAssetDataUrl(file);
          if (dataUrl) {
            setThumbnails((prev) => ({ ...prev, [file]: dataUrl }));
          }
        }
      }
    }
    loadThumbnails();
  }, [files]);

  useEffect(() => {
    if (!folder || !name.trim()) {
      setTargetPath(null);
      setTargetDirName("");
      setTargetExists(false);
      setTargetError(null);
      setCheckingTarget(false);
      return;
    }

    let cancelled = false;
    setCheckingTarget(true);
    setTargetError(null);

    window.remotion
      .checkProjectTarget(folder, name.trim())
      .then((result) => {
        if (cancelled) return;
        setTargetPath(result.projectPath);
        setTargetDirName(result.safeDirName);
        setTargetExists(result.exists);
      })
      .catch((err) => {
        if (cancelled) return;
        setTargetPath(null);
        setTargetDirName("");
        setTargetExists(false);
        setTargetError(
          err instanceof Error
            ? err.message
            : "Projektordner konnte nicht geprüft werden",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingTarget(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [folder, name]);

  async function handlePickFolder() {
    const selected = await window.remotion.pickFolder();
    if (selected) {
      setFolder(selected);
      setTargetError(null);
    }
  }

  async function handlePickFiles() {
    const selected = await window.remotion.pickFiles([
      {
        name: "Alle Dateien",
        extensions: ["*"],
      },
    ]);
    if (selected.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...selected.filter((f) => !prev.includes(f)),
      ]);
    }
  }

  function removeFile(file: string) {
    setFiles((prev) => prev.filter((f) => f !== file));
  }

  async function handleScaffold() {
    if (!folder || !name.trim()) return;
    setError(null);
    setTargetError(null);

    try {
      const target = await window.remotion.checkProjectTarget(folder, name.trim());
      setTargetPath(target.projectPath);
      setTargetDirName(target.safeDirName);
      setTargetExists(target.exists);

      if (target.exists) {
        setStep("folder");
        return;
      }

      setStep("scaffolding");
      setScaffolding(true);

      setScaffoldStatus(
        "Remotion-Projekt wird eingerichtet (kann eine Minute dauern)...",
      );
      const projectPath = await window.remotion.scaffoldProject(
        folder,
        name.trim(),
      );

      setScaffoldStatus("Abhängigkeiten und Integrationen werden installiert...");
      await window.remotion.installDependencies(projectPath);

      // Copy assets after scaffolding so they land in public/
      if (files.length > 0) {
        setScaffoldStatus("Dateien werden kopiert...");
        await window.remotion.copyToPublic(projectPath, files);
      }

      setScaffoldStatus("Projekt wird gespeichert...");
      const project = await window.remotion.createProject(name, projectPath);

      setScaffolding(false);
      setScaffoldStatus("Fertig!");
      onProjectCreated(project);
    } catch (err) {
      setScaffolding(false);
      setError(
        err instanceof Error
          ? err.message
          : "Projekt konnte nicht erstellt werden",
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Titelleiste */}
      <div className="h-12 flex items-center px-4 pl-20 shrink-0 titlebar-drag">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={scaffolding}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Neues Projekt erstellen
            </h2>
            <p className="text-muted-foreground mt-1">
              Richte ein neues Remotion-Videoprojekt ein
            </p>
          </div>

          {/* Fortschrittsanzeige */}
          <div className="flex gap-2">
            {(["name", "folder", "assets", "scaffolding"] as Step[]).map(
              (s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    ["name", "folder", "assets", "scaffolding"].indexOf(step) >=
                    i
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                />
              ),
            )}
          </div>

          {/* Schritt 1: Name */}
          {step === "name" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Projektname</CardTitle>
                <CardDescription>
                  Wähle einen Namen für dein Videoprojekt
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Mein tolles Video"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) setStep("folder");
                  }}
                />
                <Button
                  onClick={() => setStep("folder")}
                  disabled={!name.trim()}
                >
                  Weiter
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Schritt 2: Ordner */}
          {step === "folder" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Speicherort</CardTitle>
                <CardDescription>
                  Wähle den übergeordneten Ordner. Der Projektordner wird aus
                  dem Namen erzeugt (Leerzeichen werden automatisch durch
                  Bindestriche ersetzt).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {folder ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{folder}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePickFolder}
                    >
                      Ändern
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handlePickFolder}
                    variant="outline"
                    className="w-full h-24"
                  >
                    <FolderOpen className="h-6 w-6 mr-3" />
                    Ordner auswählen
                    </Button>
                )}

                {folder && targetPath && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Projektordner
                    </p>
                    <p className="text-sm font-mono break-all">{targetPath}</p>
                  </div>
                )}

                {folder && checkingTarget && (
                  <p className="text-sm text-muted-foreground">
                    Projektordner wird geprüft...
                  </p>
                )}

                {folder && !checkingTarget && targetExists && (
                  <p className="text-sm text-destructive">
                    Der Ordner "{targetDirName}" existiert bereits. Bitte
                    wähle einen anderen Namen oder einen anderen Speicherort.
                  </p>
                )}

                {folder && !checkingTarget && targetError && (
                  <p className="text-sm text-destructive">{targetError}</p>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("name")}>
                    Zurück
                  </Button>
                  <Button
                    onClick={() => setStep("assets")}
                    disabled={
                      !folder ||
                      checkingTarget ||
                      targetExists ||
                      Boolean(targetError)
                    }
                  >
                    Weiter
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schritt 3: Dateien */}
          {step === "assets" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dateien hinzufügen</CardTitle>
                <CardDescription>
                  Füge Bilder, Videos und andere Dateien zu deinem Projekt
                  hinzu. Du kannst auch später weitere hinzufügen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handlePickFiles} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Dateien hinzufügen
                </Button>

                {files.length > 0 &&
                  (() => {
                    const mediaFiles = files.filter((f) => {
                      const ext = f.split(".").pop()?.toLowerCase() || "";
                      return [
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
                      ].includes(ext);
                    });
                    const otherFiles = files.filter(
                      (f) => !mediaFiles.includes(f),
                    );

                    return (
                      <div className="space-y-3">
                        {/* Media tiles */}
                        {mediaFiles.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {mediaFiles.map((file) => {
                              const filename = file.split("/").pop() || file;
                              const ext =
                                filename.split(".").pop()?.toLowerCase() || "";
                              const isVideo = [
                                "mp4",
                                "webm",
                                "mov",
                                "avi",
                                "mkv",
                              ].includes(ext);
                              return (
                                <div
                                  key={file}
                                  className="relative group aspect-square rounded-lg overflow-hidden bg-muted border"
                                >
                                  {thumbnails[file] ? (
                                    <img
                                      src={thumbnails[file]}
                                      alt={filename}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      {isVideo ? (
                                        <FileVideo className="h-8 w-8 text-muted-foreground/50" />
                                      ) : (
                                        <FileImage className="h-8 w-8 text-muted-foreground/50" />
                                      )}
                                    </div>
                                  )}
                                  {isVideo && thumbnails[file] && (
                                    <div className="absolute bottom-1 left-1">
                                      <FileVideo className="h-4 w-4 text-white drop-shadow" />
                                    </div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                                    <p className="text-[10px] text-white truncate">
                                      {filename}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1 right-1 h-5 w-5 bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100"
                                    onClick={() => removeFile(file)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Other files as list */}
                        {otherFiles.length > 0 && (
                          <div className="space-y-1">
                            {otherFiles.map((file) => {
                              const filename = file.split("/").pop() || file;
                              return (
                                <div
                                  key={file}
                                  className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm"
                                >
                                  {fileIcon(filename)}
                                  <span className="flex-1 truncate">
                                    {filename}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => removeFile(file)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("folder")}>
                    Zurück
                  </Button>
                  <Button onClick={handleScaffold}>
                    {files.length > 0
                      ? "Projekt erstellen"
                      : "Überspringen & Projekt erstellen"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schritt 4: Einrichtung */}
          {step === "scaffolding" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {scaffolding
                    ? "Projekt wird eingerichtet..."
                    : error
                      ? "Fehler"
                      : "Projekt erstellt!"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  {scaffolding ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : error ? (
                    <X className="h-5 w-5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  <span className="text-sm">{error || scaffoldStatus}</span>
                </div>
                {error && (
                  <div className="space-y-2">
                    <Badge variant="destructive">Fehlgeschlagen</Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setStep("folder")}
                      >
                        Zum Speicherort
                      </Button>
                      <Button onClick={handleScaffold}>Erneut versuchen</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
