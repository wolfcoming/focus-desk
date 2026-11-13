import { useEffect, useRef, useState, type ReactNode } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, message } from "../api";
import { ProjectOverlays, Projects } from "../Projects";
import { Auth } from "../Auth";
import { Settings } from "../Settings";
import { AndroidNotes } from "./Notes";
import { Today } from "../Today";
import { Todos } from "../Todos";
import type { Project } from "../types";
import { ErrorText } from "../widgets";
import { More } from "./More";
import {
  HOME_TAB,
  isNested,
  readNavState,
  rootTab,
  topFrame,
  type Frame,
  type NavState,
  type Tab,
} from "./nav";
import { ProjectsHome } from "./ProjectsHome";
import "./android.css";

const TAB_ORDER: Tab[] = ["todos", "notes", "today", "projects", "more"];

const TAB_LABEL: Record<Tab, string> = {
  todos: "待办",
  notes: "笔记",
  today: "今天",
  projects: "项目",
  more: "我的",
};

const TAB_ICON: Record<Tab, ReactNode> = {
  todos: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 7.5h10M9.5 12h10M9.5 16.5h10" />
      <path d="M5 7.5l1.2 1.2L8.2 6.5M5 12l1.2 1.2L8.2 11M5 16.5l1.2 1.2L8.2 15.5" />
    </svg>
  ),
  notes: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5h7.2L18 8.2V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M14 4.8V8.4h4" />
      <path d="M8.5 12.2h7M8.5 15.4h5" />
    </svg>
  ),
  today: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
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
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 19.2c1.6-3.2 3.8-4.8 6.5-4.8s4.9 1.6 6.5 4.8" />
    </svg>
  ),
};

function sameFrame(a: Frame, b: Frame) {
  if (a.type !== b.type) return false;
  if (a.type === "tab" && b.type === "tab") return a.tab === b.tab;
  if (a.type === "project" && b.type === "project") return a.id === b.id;
  if (a.type === "sub" && b.type === "sub") return a.projectId === b.projectId && a.subId === b.subId;
  if (a.type === "todo" && b.type === "todo") return a.id === b.id;
  if (a.type === "settings" && b.type === "settings") return true;
  return a.type === "auth" && b.type === "auth";
}

export function AndroidApp() {
  const [stack, setStack] = useState<Frame[]>([{ type: "tab", tab: HOME_TAB }]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [projectRows, setProjectRows] = useState<Project[]>([]);
  const [projectTick, setProjectTick] = useState(0);
  const [createProject, setCreateProject] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const bootstrapped = useRef(false);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const top = topFrame(stack);
  const activeTab = rootTab(stack);
  const nested = isNested(stack);
  const showTabs = !nested;

  const projectId =
    top.type === "project" ? top.id
      : top.type === "sub" ? top.projectId
        : null;
  const openSubId = top.type === "sub" ? top.subId : null;
  const openTodoId = top.type === "todo" ? top.id : null;

  function writeHistory(next: Frame[], mode: "push" | "replace") {
    const state: NavState = { stack: next };
    if (mode === "push") history.pushState(state, "");
    else history.replaceState(state, "");
  }

  function replaceStack(next: Frame[]) {
    setStack(next);
    writeHistory(next, "replace");
  }

  function pushFrame(frame: Frame) {
    setStack((current) => {
      const last = current[current.length - 1];
      if (last && sameFrame(last, frame)) return current;
      const next = [...current, frame];
      writeHistory(next, "push");
      return next;
    });
  }

  function popStack(current: Frame[] = stackRef.current) {
    if (current.length <= 1) return false;
    const next = current.slice(0, -1);
    stackRef.current = next;
    setStack(next);
    writeHistory(next, "replace");
    return true;
  }

  function goBack() {
    return popStack();
  }

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    writeHistory([{ type: "tab", tab: HOME_TAB }], "replace");
  }, []);

  // Keep focused inputs above the soft keyboard (Android WebView).
  useEffect(() => {
    const root = document.documentElement;
    let focusTimer = 0;

    function keyboardInset() {
      const viewport = window.visualViewport;
      if (!viewport) return 0;
      return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    }

    function applyKeyboardInset() {
      const inset = keyboardInset();
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      document.querySelector(".android-app")?.classList.toggle("android-keyboard-open", inset > 80);
    }

    function scrollFocusedIntoView() {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (!active.matches("input, textarea, select")) return;
      const main = document.querySelector(".android-main");
      if (!(main instanceof HTMLElement)) return;
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        applyKeyboardInset();
        const rect = active.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const viewport = window.visualViewport;
        const visibleBottom = viewport
          ? viewport.offsetTop + viewport.height - 16
          : window.innerHeight - 16;
        const targetBottom = Math.min(mainRect.bottom - 12, visibleBottom);
        if (rect.bottom > targetBottom || rect.top < mainRect.top + 12) {
          active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        }
      }, 60);
    }

    function onViewportChange() {
      applyKeyboardInset();
      scrollFocusedIntoView();
    }

    function onFocusOut() {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(applyKeyboardInset, 120);
    }

    applyKeyboardInset();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", applyKeyboardInset);
    window.addEventListener("focusin", scrollFocusedIntoView);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", applyKeyboardInset);

    return () => {
      window.clearTimeout(focusTimer);
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", applyKeyboardInset);
      window.removeEventListener("focusin", scrollFocusedIntoView);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", applyKeyboardInset);
      root.style.setProperty("--keyboard-inset", "0px");
      document.querySelector(".android-app")?.classList.remove("android-keyboard-open");
    };
  }, []);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = readNavState(event.state).stack;
      stackRef.current = next;
      setStack(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const host = window as Window & {
      __focusdeskBack?: () => boolean;
      __focusdeskNavDepth?: () => number;
    };
    host.__focusdeskNavDepth = () => stackRef.current.length;
    host.__focusdeskBack = () => popStack(stackRef.current);
    return () => {
      delete host.__focusdeskBack;
      delete host.__focusdeskNavDepth;
    };
  }, []);

  // Claim Android system back via Tauri AppPlugin (otherwise it only WebView.goBack()).
  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;
    void onBackButtonPress(() => {
      if (popStack(stackRef.current)) return;
      void invoke("plugin:app|exit").catch(() => {
        // Fallback: nothing nested and exit unavailable — stay put.
      });
    })
      .then((listener) => {
        if (cancelled) {
          void listener.unregister();
          return;
        }
        unregister = () => {
          void listener.unregister();
        };
      })
      .catch(() => {
        // Desktop / unsupported — ignore.
      });
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

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
        replaceStack([{ type: "tab", tab: "todos" }]);
        return;
      }
      if (target.projectId == null) return;
      const next: Frame[] = [
        { type: "tab", tab: "projects" },
        { type: "project", id: target.projectId },
      ];
      if (target.subprojectId != null) {
        next.push({ type: "sub", projectId: target.projectId, subId: target.subprojectId });
      }
      setProjectTick((value) => value + 1);
      replaceStack(next);
    }).then((fn) => {
      unlistenOpen = fn;
    });
    return () => {
      window.removeEventListener("desk-changed", refresh);
      unlistenChanged?.();
      unlistenOpen?.();
    };
  }, []);

  function goTab(tab: Tab) {
    replaceStack([{ type: "tab", tab }]);
  }

  function openProject(id: number, subprojectId?: number | null) {
    setProjectTick((value) => value + 1);
    setStack((current) => {
      const onProjectsRoot = current.length === 1 && current[0]?.type === "tab" && current[0].tab === "projects";
      const onThisProject = current.some((frame) => frame.type === "project" && frame.id === id);
      let next: Frame[];
      if (subprojectId != null) {
        next = onThisProject
          ? [...current.filter((frame) => frame.type !== "sub"), { type: "sub", projectId: id, subId: subprojectId }]
          : [
              { type: "tab", tab: "projects" },
              { type: "project", id },
              { type: "sub", projectId: id, subId: subprojectId },
            ];
      } else if (onProjectsRoot) {
        next = [...current, { type: "project", id }];
      } else if (onThisProject) {
        next = current.filter((frame) => frame.type !== "sub");
        if (next[next.length - 1]?.type !== "project") {
          next = [...next, { type: "project", id }];
        }
      } else {
        next = [
          { type: "tab", tab: "projects" },
          { type: "project", id },
        ];
      }
      writeHistory(next, "push");
      return next;
    });
  }

  function openSub(projectIdValue: number, subId: number) {
    setProjectTick((value) => value + 1);
    pushFrame({ type: "sub", projectId: projectIdValue, subId });
  }

  function openTodo(id: number) {
    setStack((current) => {
      const onTodosRoot = current.length === 1 && current[0]?.type === "tab" && current[0].tab === "todos";
      const next: Frame[] = onTodosRoot
        ? [...current, { type: "todo", id }]
        : [
            { type: "tab", tab: "todos" },
            { type: "todo", id },
          ];
      writeHistory(next, "push");
      return next;
    });
  }

  return (
    <div className={`android-app${nested ? " android-nested" : ""}`}>
      {nested && (
        <button type="button" className="android-float-back" onClick={goBack} aria-label="返回">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5.5 8.5 12 15 18.5" />
          </svg>
        </button>
      )}

      <main className="android-main">
        <ErrorText text={error} />
        {top.type === "tab" && top.tab === "notes" ? <AndroidNotes revision={revision} /> : null}
        {top.type === "tab" && top.tab === "today" && (
          <Today revision={revision} onOpen={openProject} onOpenTodos={() => goTab("todos")} />
        )}
        {(top.type === "tab" && top.tab === "todos") || top.type === "todo" ? (
          <Todos
            revision={revision}
            onOpen={openProject}
            openTodoId={openTodoId}
            onRequestOpenTodo={openTodo}
            onRequestCloseTodo={goBack}
            chromeBack={false}
          />
        ) : null}
        {top.type === "tab" && top.tab === "projects" && (
          <ProjectsHome
            projects={projectRows}
            onOpen={(id) => openProject(id)}
            onCreate={() => setCreateProject(true)}
          />
        )}
        {(top.type === "project" || top.type === "sub") && projectId != null && (
          <Projects
            revision={revision}
            selectedId={projectId}
            projectTick={projectTick}
            focusSubId={openSubId}
            onFocusedSub={() => {}}
            onAskDelete={setDeleteProject}
            onRequestOpenSub={(subId) => openSub(projectId, subId)}
            onRequestCloseSub={goBack}
            chromeBack={false}
          />
        )}
        {top.type === "tab" && top.tab === "more" && (
          <More
            revision={revision}
            onOpenSettings={() => pushFrame({ type: "settings" })}
            onOpenAuth={() => pushFrame({ type: "auth" })}
          />
        )}
        {top.type === "settings" && (
          <Settings revision={revision} onRequestAuth={() => pushFrame({ type: "auth" })} />
        )}
        {top.type === "auth" && (
          <Auth
            revision={revision}
            onDone={() => replaceStack([{ type: "tab", tab: "more" }])}
            onOpenSettings={() => replaceStack([{ type: "tab", tab: "more" }, { type: "settings" }])}
          />
        )}

        <ProjectOverlays
          createOpen={createProject}
          deleteTarget={deleteProject}
          onCloseCreate={() => setCreateProject(false)}
          onCloseDelete={() => setDeleteProject(null)}
          onCreated={(project) => {
            setCreateProject(false);
            setProjectTick((value) => value + 1);
            replaceStack([
              { type: "tab", tab: "projects" },
              { type: "project", id: project.id },
            ]);
          }}
          onDeleted={(id) => {
            setDeleteProject(null);
            if (projectId === id) replaceStack([{ type: "tab", tab: "projects" }]);
          }}
        />
      </main>

      {showTabs && (
        <nav className="android-tabbar" aria-label="主导航">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "android-tab active" : "android-tab"}
              onClick={() => goTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
            >
              <span className="android-tab-icon">{TAB_ICON[tab]}</span>
              <span className="android-tab-label">{TAB_LABEL[tab]}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
