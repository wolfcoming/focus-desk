import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, message } from "./api";
import { Inbox } from "./Inbox";
import { Reminder } from "./Reminder";
import { Progress } from "./Progress";
import { Settings } from "./Settings";
import { ProjectOverlays, Projects } from "./Projects";
import { Today } from "./Today";
import type { Limits, Project } from "./types";
import { projectStatus } from "./types";
import { Waiting } from "./Waiting";
import { Chevron, ErrorText } from "./widgets";

type Page = "today" | "inbox" | "projects" | "waiting" | "progress" | "settings";

const pages: { id: Page; label: string }[] = [
  { id: "today", label: "今天" },
  { id: "inbox", label: "临时任务" },
  { id: "projects", label: "项目" },
  { id: "waiting", label: "等待" },
  { id: "progress", label: "进度" },
  { id: "settings", label: "设置" },
];

function Shell() {
  const [page, setPage] = useState<Page>("today");
  const [limits, setLimits] = useState<Limits | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [projectRows, setProjectRows] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectTick, setProjectTick] = useState(0);
  const [createProject, setCreateProject] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);

  useEffect(() => {
    void api.limits().then(setLimits).catch((reason) => setError(message(reason)));
    void api.listProjects().then(setProjectRows).catch((reason) => setError(message(reason)));
  }, [revision]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("desk-changed", refresh);
    void listen("desk://changed", refresh).then((fn) => {
      unlisten = fn;
    });
    return () => {
      window.removeEventListener("desk-changed", refresh);
      unlisten?.();
    };
  }, []);

  async function capture() {
    const title = draft.trim();
    if (!title) return;
    try {
      await api.capture(title);
      setDraft("");
      setRevision((value) => value + 1);
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <strong>Focus Desk</strong>
          <span>今天只盯三件</span>
        </div>
        <nav className="nav">
          {pages.map((item) => item.id === "projects" ? (
            <div key={item.id}>
              <div className="nav-row">
                <button type="button" className="chevron-btn" aria-expanded={projectsOpen} aria-label={projectsOpen ? "收起项目" : "展开项目"} onClick={() => setProjectsOpen((open) => !open)}>
                  <Chevron open={projectsOpen} />
                </button>
                <button type="button" className={page === "projects" && projectId == null ? "active" : ""} onClick={() => { setProjectsOpen(true); setPage("projects"); setProjectId(null); }}>
                  项目
                </button>
              </div>
              {projectsOpen && (
                <div className="tree">
                  {projectRows.filter((project) => project.status !== "archived").map((project) => (
                    <div className="tree-row" key={project.id}>
                      <button
                        type="button"
                        className={page === "projects" && projectId === project.id ? "tree-project active" : "tree-project"}
                        onClick={() => { setPage("projects"); setProjectId(project.id); setProjectTick((value) => value + 1); }}
                      >
                        <span className="tree-name">{project.name}</span>
                        <span className="meta">{projectStatus[project.status] ?? project.status}</span>
                      </button>
                      <button type="button" className="quiet tree-delete" onClick={() => setDeleteProject(project)}>删除</button>
                    </div>
                  ))}
                  <button type="button" className="tree-add" onClick={() => { setPage("projects"); setCreateProject(true); }}>新建项目</button>
                </div>
              )}
            </div>
          ) : (
            <button key={item.id} type="button" className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="wip">
          进行中的大项目 {limits?.activeProjects ?? 0}
          <br />
          进行中的子任务 {limits?.activeSubprojects ?? 0}
        </p>
      </aside>
      <main className="main">
        <form className="capture" onSubmit={(event) => { event.preventDefault(); void capture(); }}>
          <input value={draft} placeholder="随手记一条临时任务，先不用分类" onChange={(event) => setDraft(event.target.value)} />
          <button className="primary" type="submit">收下</button>
        </form>
        <ErrorText text={error} />
        {page === "today" && <Today revision={revision} />}
        {page === "inbox" && <Inbox revision={revision} />}
        {page === "projects" && (
          <Projects
            revision={revision}
            selectedId={projectId}
            projectTick={projectTick}
            onAskDelete={setDeleteProject}
            onSelectProject={(id) => { setProjectId(id); setProjectTick((value) => value + 1); }}
          />
        )}
        <ProjectOverlays
          createOpen={createProject}
          deleteTarget={deleteProject}
          onCloseCreate={() => setCreateProject(false)}
          onCloseDelete={() => setDeleteProject(null)}
          onCreated={(project) => { setProjectId(project.id); setPage("projects"); setCreateProject(false); }}
          onDeleted={(id) => { setProjectId((current) => current === id ? null : current); setDeleteProject(null); }}
        />
        {page === "waiting" && <Waiting revision={revision} />}
        {page === "progress" && (
          <Progress
            revision={revision}
            onOpen={(id) => { setPage("projects"); setProjectId(id); setProjectTick((value) => value + 1); }}
          />
        )}
        {page === "settings" && <Settings revision={revision} />}
      </main>
    </div>
  );
}

export default function App() {
  const reminder = new URLSearchParams(window.location.search).get("view") === "reminder";
  if (reminder) return <Reminder />;
  return <Shell />;
}
