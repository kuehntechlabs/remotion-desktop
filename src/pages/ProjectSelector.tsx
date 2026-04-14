import { useEffect, useState } from "react";
import type { Project } from "../types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Film, FolderOpen } from "lucide-react";

interface Props {
  onCreateNew: () => void;
  onOpenProject: (project: Project) => void;
}

export default function ProjectSelector({ onCreateNew, onOpenProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    window.remotion.getProjects().then(setProjects);
  }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await window.remotion.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleOpen(project: Project) {
    await window.remotion.setLastOpened(project.id);
    onOpenProject(project);
  }

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="h-12 flex items-center justify-center shrink-0">
          <h1 className="text-sm font-medium text-muted-foreground">
            Remotion Desktop
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Film className="h-20 w-20 text-muted-foreground/40 mx-auto mb-6" />
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Erstelle dein erstes Projekt
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Starte mit einem neuen Remotion-Videoprojekt und erwecke deine
              Ideen zum Leben
            </p>
            <Button onClick={onCreateNew} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Neues Projekt erstellen
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Has projects: list view
  return (
    <div className="flex-1 flex flex-col">
      <div className="h-12 flex items-center justify-center shrink-0">
        <h1 className="text-sm font-medium text-muted-foreground">
          Remotion Desktop
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <Film className="h-8 w-8" />
                Deine Projekte
              </h2>
              <p className="text-muted-foreground mt-1">
                Erstelle und verwalte deine Remotion-Videoprojekte
              </p>
            </div>
            <Button onClick={onCreateNew} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Neues Projekt
            </Button>
          </div>

          <div className="grid gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleOpen(project)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Film className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {project.path}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(project.createdAt).toLocaleDateString("de-DE")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(e, project.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
