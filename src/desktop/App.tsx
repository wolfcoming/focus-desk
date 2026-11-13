import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Auth } from "../Auth";
import { api, message } from "../api";
import { Settings } from "../Settings";
import { ProjectOverlays, Projects } from "../Projects";
import { Notes } from "../Notes";
import { Today } from "../Today";
import { Todos } from "../Todos";
import type { Project } from "../types";
import { ThemeToggle } from "../ThemeToggle";
import { ErrorText, showToast } from "../widgets";
import { fetchRailQuote, localQuoteOfDay, type Quote } from "../quotes";

type Page = "today" | "todos" | "projects" | "notes" | "settings" | "auth";

function SyncIcon() {
  return (
    <svg className="account-sync-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 7.2A6.4 6.4 0 0 1 18.7 9.5" />
      <path d="M17.2 6.2v3.4h-3.4" />
      <path d="M16.5 16.8A6.4 6.4 0 0 1 5.3 14.5" />
      <path d="M6.8 17.8v-3.4h3.4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

export function DesktopApp() {
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
  const [signedIn, setSignedIn] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    void api.listProjects().then(setProjectRows).catch((reason) => setError(message(reason)));
  }, [revision]);

  useEffect(() => {
    void fetchRailQuote().then(setQuote);
  }, []);

  useEffect(() => {
    void api.syncStatus().then((status) => {
      setSignedIn(status.signedIn);
      setAccountName(status.signedIn ? (status.displayName?.trim() || "") : "");
    }).catch(() => {});
  }, [revision]);

  async function runRailSync() {
    if (syncBusy || !signedIn) return;
    setSyncBusy(true);
    setError("");
    try {
      const result = await api.syncNow();
      window.dispatchEvent(new Event("desk-changed"));
      showToast(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}`);
    } catch (reason) {
      const text = message(reason);
      setError(text);
      showToast(text, "error");
    } finally {
      setSyncBusy(false);
    }
  }

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
        <div className="brand account-chip">
          {signedIn ? (
            <div className="account-chip-row">
              <button
                type="button"
                className="account-name-btn"
                onClick={() => setPage("settings")}
              >
                <strong className={accountName ? undefined : "is-empty"}>{accountName || "未设置"}</strong>
              </button>
              <button
                type="button"
                className={`account-sync-btn${syncBusy ? " is-busy" : ""}`}
                aria-label={syncBusy ? "同步中" : "同步数据"}
                title={syncBusy ? "同步中…" : "同步数据"}
                disabled={syncBusy}
                onClick={() => void runRailSync()}
              >
                <SyncIcon />
              </button>
            </div>
          ) : (
            <button type="button" className="account-name-btn" onClick={() => setPage("auth")}>
              <strong>登录</strong>
              <span>同步项目与待办</span>
            </button>
          )}
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">日常</div>
            {navButton("today", "今天")}
            {navButton("todos", "待办")}
            {navButton("notes", "笔记")}
          </div>

          <div className="nav-divider" role="separator" aria-hidden />

          <div className="nav-group nav-group-projects">
            <div className="nav-label-row">
              <div className="nav-label">项目</div>
              <button
                type="button"
                className="nav-add-icon"
                aria-label="新建项目"
                title="新建项目"
                onClick={() => setCreateProject(true)}
              >
                <PlusIcon />
              </button>
            </div>
            <div className="tree tree-flat nav-projects-scroll">
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
            </div>
          </div>

          <div className="nav-divider" role="separator" aria-hidden />

          <div className="nav-group nav-group-footer">
            <div className="nav-label">其他</div>
            <ThemeToggle />
            {navButton("settings", "设置")}
          </div>
        </nav>
        <figure className="rail-quote">
          <blockquote>{quote.text}</blockquote>
          {quote.from ? <figcaption>{quote.from}</figcaption> : null}
        </figure>
      </aside>
      <main className={page === "notes" ? "main main-notes" : "main"}>
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
        {page === "notes" && <Notes />}
        {page === "settings" && (
          <Settings revision={revision} onRequestAuth={() => setPage("auth")} />
        )}
        {page === "auth" && (
          <Auth
            revision={revision}
            onDone={() => setPage("settings")}
            onOpenSettings={() => setPage("settings")}
          />
        )}
      </main>
    </div>
  );
}
