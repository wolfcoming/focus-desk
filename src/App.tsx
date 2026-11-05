import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, message } from "./api";
import { Reminder } from "./Reminder";
import { Progress } from "./Progress";
import { Settings } from "./Settings";
import { ProjectOverlays, Projects } from "./Projects";
import { Today } from "./Today";
import { Todos } from "./Todos";
import type { Project } from "./types";
import { Weekly } from "./Weekly";
import { ErrorText } from "./widgets";
import { fetchRailQuote, localQuoteOfDay, type Quote } from "./quotes";

type Page = "today" | "todos" | "projects" | "progress" | "weekly" | "settings";

function Shell() {
  const [page, setPage] = useState<Page>("today");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [projectRows, setProjectRows] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectTick, setProjectTick] = useState(0);
  const [focusSubId, setFocusSubId] = useState<number | null>(null);
  const [createProject, setCreateProject] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [quote, setQuote] = useState<Quote>(() => localQuoteOfDay());

  useEffect(() => {
    void api.listProjects().then(setProjectRows).catch((reason) => setError(message(reason)));
  }, [revision]);

  useEffect(() => {
    void fetchRailQuote().then(setQuote);
  }, []);

  useEffect(() => {
    let unlistenChanged: (() => void) | undefined;
    let unlistenOpen: (() => void) | undefined;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("desk-changed", refresh);
    void listen("desk://changed", refresh).then((fn) => {
      unlistenChanged = fn;
    });
    void listen<{ page: string; projectId: number | null; subprojectId: number | null }>("desk://open", (event) => {
      const target = event.payload;
      if (target.page === "todos") {
        setPage("todos");
        setFocusSubId(null);
        return;
      }
      if (target.projectId == null) return;
      setPage("projects");
      setFocusSubId(target.subprojectId);
      setProjectId(target.projectId);
      setProjectTick((value) => value + 1);
    }).then((fn) => {
      unlistenOpen = fn;
    });
    return () => {
      window.removeEventListener("desk-changed", refresh);
      unlistenChanged?.();
      unlistenOpen?.();
    };
  }, []);

  function openProject(id: number, subprojectId?: number | null) {
    setFocusSubId(subprojectId ?? null);
    setPage("projects");
    setProjectId(id);
    setProjectTick((value) => value + 1);
  }

  function navButton(id: Page, label: string) {
    return (
      <button key={id} type="button" className={page === id ? "active" : ""} onClick={() => setPage(id)}>
        {label}
      </button>
    );
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <strong>Little Fun</strong>
          <span>干净桌面 · 今日三件</span>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">日常</div>
            {navButton("today", "今天")}
            {navButton("todos", "待办")}
          </div>

          <div className="nav-divider" role="separator" aria-hidden />

          <div className="nav-group">
            <div className="nav-label">项目</div>
            <div className="tree tree-flat">
              {projectRows.filter((project) => project.status !== "archived").map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={page === "projects" && projectId === project.id ? "tree-project active" : "tree-project"}
                  onClick={() => { setFocusSubId(null); setPage("projects"); setProjectId(project.id); setProjectTick((value) => value + 1); }}
                >
                  <span className="tree-name">{project.name}</span>
                </button>
              ))}
              <button type="button" className="tree-add" onClick={() => { setCreateProject(true); }}>新建项目</button>
            </div>
          </div>

          <div className="nav-divider" role="separator" aria-hidden />

          <div className="nav-group">
            <div className="nav-label">其他</div>
            {navButton("progress", "进度总览")}
            {navButton("weekly", "周回顾")}
            {navButton("settings", "设置")}
          </div>
        </nav>
        <figure className="rail-quote">
          <blockquote>{quote.text}</blockquote>
          {quote.from ? <figcaption>{quote.from}</figcaption> : null}
        </figure>
      </aside>
      <main className="main">
        <ErrorText text={error} />
        {page === "today" && <Today revision={revision} onOpen={openProject} onOpenTodos={() => setPage("todos")} />}
        {page === "todos" && <Todos revision={revision} onOpen={openProject} />}
        {page === "projects" && (
          <Projects
            revision={revision}
            selectedId={projectId}
            projectTick={projectTick}
            focusSubId={focusSubId}
            onFocusedSub={() => setFocusSubId(null)}
            onAskDelete={setDeleteProject}
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
        {page === "progress" && <Progress revision={revision} onOpen={openProject} />}
        {page === "weekly" && <Weekly revision={revision} onOpen={openProject} />}
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
