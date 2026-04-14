import { useState } from "react";
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
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldStatus, setScaffoldStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handlePickFolder() {
    const selected = await window.remotion.pickFolder();
    if (selected) {
      setFolder(selected);
      setStep("assets");
    }
  }

  async function handlePickFiles() {
    const selected = await window.remotion.pickFiles([
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
    setStep("scaffolding");
    setScaffolding(true);
    setError(null);

    const projectPath = `${folder}/${name.trim()}`;

    try {
      setScaffoldStatus(
        "Remotion-Projekt wird eingerichtet (kann eine Minute dauern)...",
      );
      await window.remotion.scaffoldProject(folder, name.trim());

      setScaffoldStatus("Abhängigkeiten werden installiert...");
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
                  Wähle den übergeordneten Ordner. Dein Projekt wird als
                  Unterordner "{name.trim()}" darin erstellt.
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
              </CardContent>
            </Card>
          )}

          {/* Schritt 3: Dateien */}
          {step === "assets" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dateien hinzufügen</CardTitle>
                <CardDescription>
                  Füge Bilder, Videos und Audiodateien zu deinem Projekt hinzu.
                  Du kannst auch später weitere hinzufügen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handlePickFiles} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Dateien hinzufügen
                </Button>

                {files.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {files.map((file) => {
                      const filename = file.split("/").pop() || file;
                      return (
                        <div
                          key={file}
                          className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm"
                        >
                          {fileIcon(filename)}
                          <span className="flex-1 truncate">{filename}</span>
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

                <div className="flex gap-2">
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
                        onClick={() => setStep("assets")}
                      >
                        Zurück
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
