import { useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, message } from "../api";
import { Progress } from "../Progress";
import { ProjectOverlays, Projects } from "../Projects";
import { Settings } from "../Settings";
import { Today } from "../Today";
import { Todos } from "../Todos";
import type { Project } from "../types";
import { Weekly } from "../Weekly";
import { ErrorText } from "../widgets";
import { More } from "./More";
import { ProjectsHome } from "./ProjectsHome";
import "./android.css";

type Tab = "today" | "todos" | "projects" | "more";
type Page = Tab | "progress" | "weekly" | "settings";

const TAB_LABEL: Record<Tab, string> = {
  today: "今天",
  todos: "待办",
  projects: "项目",
  more: "更多",
};

const TAB_ICON: Record<Tab, ReactNode> = {
  today: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
    </svg>
  ),
  todos: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 7.5h10M9.5 12h10M9.5 16.5h10" />
      <path d="M5 7.5l1.2 1.2L8.2 6.5M5 12l1.2 1.2L8.2 11M5 16.5l1.2 1.2L8.2 15.5" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 8.5h15v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-10z" />
      <path d="M9 8.5V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const PAGE_TITLE: Record<Page, string> = {
  today: "今天",
  todos: "待办",
  projects: "项目",
  more: "更多",
  progress: "进度总览",
  weekly: "周回顾",
  settings: "设置",
};

export function AndroidApp() {
  const [page, setPage] = useState<Page>("today");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [projectRows, setProjectRows] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectTick, setProjectTick] = useState(0);
  const [focusSubId, setFocusSubId] = useState<number | null>(null);
  const [createProject, setCreateProject] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);

  const activeTab: Tab =
    page === "progress" || page === "weekly" || page === "settings" || page === "more"
      ? "more"
      : page;
  const inProjectDetail = page === "projects" && projectId != null;
  const inMoreSub = page === "progress" || page === "weekly" || page === "settings";
  const showBack = inProjectDetail || inMoreSub;

  useEffect(() => {
    void api.listProjects().then(setProjectRows).catch((reason) => setError(message(reason)));
  }, [revision]);

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
        setProjectId(null);
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

  function goTab(tab: Tab) {
    setPage(tab);
    setProjectId(null);
    setFocusSubId(null);
  }

  function goBack() {
    if (inProjectDetail) {
      setProjectId(null);
      setFocusSubId(null);
      setPage("projects");
      return;
    }
    if (inMoreSub) {
      setPage("more");
    }
  }

  const headerTitle = inProjectDetail
    ? (projectRows.find((project) => project.id === projectId)?.name ?? "项目")
    : PAGE_TITLE[page];

  return (
    <div className="android-app">
      <header className="android-topbar">
        {showBack ? (
          <button type="button" className="android-back" onClick={goBack} aria-label="返回">
            ‹
          </button>
        ) : (
          <span className="android-topbar-brand">Little Fun</span>
        )}
        <h1 className="android-topbar-title">{headerTitle}</h1>
        <span className="android-topbar-spacer" aria-hidden />
      </header>

      <main className="android-main">
        <ErrorText text={error} />
        {page === "today" && (
          <Today revision={revision} onOpen={openProject} onOpenTodos={() => setPage("todos")} />
        )}
        {page === "todos" && <Todos revision={revision} onOpen={openProject} />}
        {page === "projects" && !inProjectDetail && (
          <ProjectsHome
            projects={projectRows}
            onOpen={(id) => openProject(id)}
            onCreate={() => setCreateProject(true)}
          />
        )}
        {page === "projects" && inProjectDetail && (
          <Projects
            revision={revision}
            selectedId={projectId}
            projectTick={projectTick}
            focusSubId={focusSubId}
            onFocusedSub={() => setFocusSubId(null)}
            onAskDelete={setDeleteProject}
          />
        )}
        {page === "more" && (
          <More onOpen={(next) => setPage(next)} />
        )}
        {page === "progress" && <Progress revision={revision} onOpen={openProject} />}
        {page === "weekly" && <Weekly revision={revision} onOpen={openProject} />}
        {page === "settings" && <Settings revision={revision} />}

        <ProjectOverlays
          createOpen={createProject}
          deleteTarget={deleteProject}
          onCloseCreate={() => setCreateProject(false)}
          onCloseDelete={() => setDeleteProject(null)}
          onCreated={(project) => {
            setProjectId(project.id);
            setPage("projects");
            setCreateProject(false);
          }}
          onDeleted={(id) => {
            setProjectId((current) => (current === id ? null : current));
            setDeleteProject(null);
            setPage("projects");
          }}
        />
      </main>

      <nav className="android-tabbar" aria-label="主导航">
        {(Object.keys(TAB_LABEL) as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "android-tab active" : "android-tab"}
            onClick={() => goTab(tab)}
          >
            <span className="android-tab-icon">{TAB_ICON[tab]}</span>
            <span className="android-tab-label">{TAB_LABEL[tab]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
