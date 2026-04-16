import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "./types";
import ProjectSelector from "./pages/ProjectSelector";
import CreateProject from "./pages/CreateProject";
import Dashboard from "./pages/Dashboard";

type Page = "selector" | "create" | "dashboard";
type UpdateDialogState = "hidden" | "available" | "downloading" | "downloaded";

export default function App() {
  const [page, setPage] = useState<Page>("selector");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateDialogState, setUpdateDialogState] =
    useState<UpdateDialogState>("hidden");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    window.remotion
      .getAppVersion()
      .then((version) => {
        if (mounted) setAppVersion(version);
      })
      .catch(() => undefined);

    const unsubscribe = window.remotion.onUpdaterEvent((payload) => {
      switch (payload.type) {
        case "checking-for-update":
          break;
        case "update-available":
          setUpdateDialogState("available");
          setUpdateError(null);
          setDownloadPercent(0);
          setLatestVersion(payload.version);
          break;
        case "update-not-available":
          break;
        case "download-progress":
          setUpdateDialogState("downloading");
          setUpdateError(null);
          setDownloadPercent(payload.percent);
          break;
        case "update-downloaded":
          setUpdateDialogState("downloaded");
          setUpdateError(null);
          setLatestVersion(payload.version);
          break;
        case "error":
          setUpdateError(payload.message);
          break;
      }
    });

    window.remotion.checkForUpdates().catch(() => undefined);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const openProject = (project: Project) => {
    setCurrentProject(project);
    setPage("dashboard");
  };

  const goHome = () => {
    setCurrentProject(null);
    setPage("selector");
  };

  async function handleDownloadAndInstall() {
    setUpdateError(null);
    setUpdateDialogState("downloading");
    setDownloadPercent(0);
    const result = await window.remotion.downloadUpdate();
    if (!result.ok && result.message) {
      setUpdateDialogState("available");
      setUpdateError(result.message);
    }
  }

  async function handleInstallAndRestart() {
    setUpdateError(null);
    const result = await window.remotion.quitAndInstallUpdate();
    if (!result.ok && result.message) {
      setUpdateError(result.message);
    }
  }

  function handleUpdateLater() {
    setUpdateDialogState("hidden");
    setUpdateError(null);
  }

  return (
    <div className="h-screen flex flex-col">
      {page === "selector" && (
        <ProjectSelector
          onCreateNew={() => setPage("create")}
          onOpenProject={openProject}
        />
      )}
      {page === "create" && (
        <CreateProject
          onBack={() => setPage("selector")}
          onProjectCreated={openProject}
        />
      )}
      {page === "dashboard" && currentProject && (
        <Dashboard project={currentProject} onBack={goHome} />
      )}

      {updateDialogState !== "hidden" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
            <h3 className="text-lg font-semibold">
              {updateDialogState === "downloaded"
                ? "Update bereit"
                : "Neue Version verfuegbar"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {updateDialogState === "downloaded"
                ? `Version ${latestVersion || "-"} wurde geladen.`
                : `Version ${latestVersion || "-"} ist verfuegbar (aktuell ${appVersion || "-"}).`}
            </p>

            {updateDialogState === "downloading" && (
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, downloadPercent))}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Download: {Math.round(downloadPercent)}%
                </p>
              </div>
            )}

            {updateError && (
              <p className="mt-3 text-sm text-destructive">{updateError}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={handleUpdateLater}>
                Spaeter
              </Button>

              {updateDialogState === "available" && (
                <Button onClick={handleDownloadAndInstall}>
                  Update herunterladen
                </Button>
              )}

              {updateDialogState === "downloading" && (
                <Button disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird geladen...
                </Button>
              )}

              {updateDialogState === "downloaded" && (
                <Button onClick={handleInstallAndRestart}>Neustart & Update</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
