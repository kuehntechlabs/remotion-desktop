import { useState } from "react";
import type { Project } from "./types";
import ProjectSelector from "./pages/ProjectSelector";
import CreateProject from "./pages/CreateProject";
import Dashboard from "./pages/Dashboard";

type Page = "selector" | "create" | "dashboard";

export default function App() {
  const [page, setPage] = useState<Page>("selector");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const openProject = (project: Project) => {
    setCurrentProject(project);
    setPage("dashboard");
  };

  const goHome = () => {
    setCurrentProject(null);
    setPage("selector");
  };

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
    </div>
  );
}
