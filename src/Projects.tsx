import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { isAndroid } from "./android/platform";
import { api, message } from "./api";
import { ProjectBlocked } from "./ProjectBlocked";
import type { IdeaTag, Item, Project, Subproject, WorkLog } from "./types";
import { IDEA_TAG_COLORS, parseQuadrant, quadrantValue, QUADRANT_OPTIONS, subStatus } from "./types";
import { Chevron, DateTimeField, DayChecks, Dialog, Empty, ErrorText, Field, PercentSlider, TimeField, when } from "./widgets";

function ideaBoardPercent(board: HTMLElement, clientX: number, clientY: number) {
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 20, y: 20 };
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return {
    x: Math.min(98, Math.max(2, x)),
    y: Math.min(98, Math.max(2, y)),
  };
}

const emptyProjectForm = { name: "", outcome: "" };
const emptySubForm = {
  kind: "regular",
  name: "",
  description: "",
  quadrant: "iu",
  progress: "doing",
  dueAt: "",
  repeatDays: "1,2,3,4,5",
  remind: false,
  remindAt: "09:00",
  progressPercent: "0",
};

const progressLabel: Record<string, string> = {
  not_started: "未开始",
  doing: "进行中",
  done: "已完成",
};

function logStamp(log: WorkLog) {
  const label = progressLabel[log.progress] ?? log.progress;
  const percent = log.progress === "doing" && log.progressPercent != null ? ` ${log.progressPercent}%` : "";
  return `${when(log.createdAt)} · ${label}${percent}`;
}

function progressOf(sub: Subproject) {
  if (sub.progress === "not_started" || sub.progress === "doing" || sub.progress === "done") return sub.progress;
  if (sub.status === "done") return "done";
  if (sub.status === "active") return "doing";
  return "not_started";
}

function repeatLabel(value: string | null) {
  const names: Record<string, string> = { "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "日" };
  const days = (value ?? "").split(",").map((day) => names[day.trim()]).filter(Boolean);
  return days.length ? `周${days.join("、")}` : "未选重复日";
}

function subMetaTags(sub: Subproject) {
  if (sub.kind === "periodic") {
    const tags = [
      sub.status === "paused" ? { tone: "paused", label: "暂停" } : null,
      { tone: "periodic", label: "周期性" },
      { tone: "periodic", label: repeatLabel(sub.repeatDays) },
      { tone: "periodic", label: sub.remindAt ? `${sub.remindAt} 提醒` : "不定时提醒" },
    ];
    return tags.filter(Boolean) as { tone: string; label: string }[];
  }
  const tone = sub.status === "paused"
    ? "paused"
    : (sub.progress === "doing" || sub.progress === "done" || sub.progress === "not_started" ? sub.progress : "not_started");
  const progress = sub.status === "paused"
    ? "暂停"
    : (progressLabel[sub.progress] ?? subStatus[sub.status]);
  const percent = sub.status !== "paused" && sub.progress === "doing" && sub.progressPercent != null ? ` ${sub.progressPercent}%` : "";
  const quadrant = sub.quadrant ?? (sub.important == null ? "" : sub.important ? "重要" : "不重要");
  const tags = [
    { tone, label: `${progress}${percent}` },
    quadrant ? { tone, label: quadrant } : null,
    sub.dueAt ? { tone, label: `截止 ${when(sub.dueAt)}` } : null,
  ];
  return tags.filter(Boolean) as { tone: string; label: string }[];
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V3h3.5a.5.5 0 0 1 0 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a.5.5 0 0 1 0-1H6.5V2zm1 1h1V2h-1v1zM4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4H4zm2.5 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5z"
      />
    </svg>
  );
}

function subDetailFacts(sub: Subproject) {
  if (sub.kind === "periodic") {
    return [
      repeatLabel(sub.repeatDays),
      sub.remindAt ? `${sub.remindAt} 提醒` : "不定时提醒",
    ];
  }
  const quadrant = QUADRANT_OPTIONS.find((option) => option.value === quadrantValue(sub.important, sub.urgent))?.label
    ?? sub.quadrant
    ?? "未设象限";
  return [
    quadrant,
    sub.dueAt ? `截止 ${when(sub.dueAt)}` : "未设截止",
  ];
}

export function ProjectOverlays({
  createOpen,
  deleteTarget,
  onCloseCreate,
  onCloseDelete,
  onCreated,
  onDeleted,
}: {
  createOpen: boolean;
  deleteTarget: Project | null;
  onCloseCreate: () => void;
  onCloseDelete: () => void;
  onCreated: (project: Project) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState(emptyProjectForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!createOpen) return;
    setForm(emptyProjectForm);
    setError("");
  }, [createOpen]);

  useEffect(() => {
    if (deleteTarget) setError("");
  }, [deleteTarget]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.createProject({
        name: form.name,
        outcome: form.outcome,
        status: "active",
      });
      window.dispatchEvent(new Event("desk-changed"));
      onCreated(created);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await api.deleteProject(deleteTarget.id);
      window.dispatchEvent(new Event("desk-changed"));
      onDeleted(deleteTarget.id);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {createOpen && (
        <Dialog title="新建项目" onClose={onCloseCreate}>
          <form className="stack" onSubmit={(event) => void create(event)}>
            <Field label="名称"><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="项目描述"><textarea rows={3} value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })} /></Field>
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={onCloseCreate}>取消</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? "正在建立…" : "建立"}</button>
            </div>
          </form>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog title="删除大项目" onClose={onCloseDelete}>
          <p>删除「{deleteTarget.name}」后，它下面的子任务和任务也会一起去掉，不能恢复。</p>
          <ErrorText text={error} />
          <div className="actions">
            <button type="button" className="quiet" onClick={onCloseDelete}>取消</button>
            <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>{busy ? "正在删除…" : "删除"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function Projects({
  revision,
  selectedId,
  projectTick,
  focusSubId = null,
  onFocusedSub,
  onAskDelete,
  onRequestOpenSub,
  onRequestCloseSub,
  chromeBack = true,
}: {
  revision: number;
  selectedId: number | null;
  projectTick: number;
  focusSubId?: number | null;
  onFocusedSub?: () => void;
  onAskDelete: (project: Project) => void;
  onRequestOpenSub?: (subId: number) => void;
  onRequestCloseSub?: () => void;
  chromeBack?: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [todos, setTodos] = useState<Item[]>([]);
  const [ideaTags, setIdeaTags] = useState<IdeaTag[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createSub, setCreateSub] = useState(false);
  const [internalOpenSubId, setInternalOpenSubId] = useState<number | null>(null);
  const controlledSub = onRequestOpenSub != null;
  const openSubId = controlledSub ? (focusSubId ?? null) : internalOpenSubId;
  const [progressForm, setProgressForm] = useState({ progress: "doing", progressPercent: "", log: "" });
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [quadrantDraft, setQuadrantDraft] = useState("");
  const [dueAtDraft, setDueAtDraft] = useState("");
  const [remindDraft, setRemindDraft] = useState({ enabled: false, time: "09:00" });
  const [repeatDaysDraft, setRepeatDaysDraft] = useState("1,2,3,4,5");
  const [updateDraft, setUpdateDraft] = useState("");
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingLogBody, setEditingLogBody] = useState("");
  const [deleteSub, setDeleteSub] = useState<Subproject | null>(null);
  const [subForm, setSubForm] = useState(emptySubForm);
  const [doneOpen, setDoneOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [keyProgressOpen, setKeyProgressOpen] = useState(false);
  const [subTodoTitle, setSubTodoTitle] = useState("");
  const [placingIdea, setPlacingIdea] = useState<{ color: string } | null>(null);
  const [placingPos, setPlacingPos] = useState({ x: 50, y: 40 });
  const [draggingIdeaId, setDraggingIdeaId] = useState<number | null>(null);
  const [focusIdeaId, setFocusIdeaId] = useState<number | null>(null);
  const ideaBoardRef = useRef<HTMLDivElement | null>(null);
  const ideaInputRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const ideaDragRef = useRef<{
    id: number;
    originX: number;
    originY: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const ideaTagsRef = useRef(ideaTags);
  ideaTagsRef.current = ideaTags;
  const ideaSavedBodyRef = useRef<Map<number, string>>(new Map());
  const [editingInfo, setEditingInfo] = useState(false);

  async function load() {
    const [nextProjects, nextSubs, nextLogs, nextTodos] = await Promise.all([
      api.listProjects(),
      api.listSubprojects(null),
      api.listWorkLogs(selectedId),
      api.listItems("todo"),
    ]);
    setProjects(nextProjects);
    setSubs(nextSubs);
    setLogs(nextLogs);
    setTodos(nextTodos.filter((item) => item.status === "open"));
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision, selectedId]);

  // 切项目 / 点侧栏回到项目总览时关掉子任务；不要在 focusSubId 被消费清空时误关详情
  useEffect(() => {
    if (controlledSub) return;
    if (focusSubId != null) return;
    setInternalOpenSubId(null);
  }, [selectedId, projectTick, controlledSub, focusSubId]);

  useEffect(() => {
    if (focusSubId == null) return;
    const target = subs.find((sub) => sub.id === focusSubId);
    if (!target) return;
    if (controlledSub) {
      syncInfoDrafts(target);
      onFocusedSub?.();
      return;
    }
    openSub(target);
    onFocusedSub?.();
  }, [focusSubId, subs, projectTick, controlledSub]);

  useEffect(() => {
    const currentOpen = subs.find((sub) => sub.id === openSubId);
    if (!currentOpen || editingInfo) return;
    setNameDraft(currentOpen.name);
    setDescriptionDraft(currentOpen.description ?? "");
    if (currentOpen.kind === "periodic") {
      setRepeatDaysDraft(currentOpen.repeatDays || "1,2,3,4,5");
      setRemindDraft({ enabled: currentOpen.remindAt != null, time: currentOpen.remindAt ?? "09:00" });
    } else {
      setQuadrantDraft(quadrantValue(currentOpen.important, currentOpen.urgent));
      setDueAtDraft(currentOpen.dueAt ?? "");
    }
  }, [subs, openSubId, editingInfo]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
      window.dispatchEvent(new Event("desk-changed"));
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const current = projects.find((project) => project.id === selectedId) ?? null;

  function openCreate() {
    setSubForm(emptySubForm);
    setError("");
    setCreateSub(true);
  }

  function syncInfoDrafts(sub: Subproject) {
    setNameDraft(sub.name);
    setDescriptionDraft(sub.description ?? "");
    setRepeatDaysDraft(sub.repeatDays || "1,2,3,4,5");
    setRemindDraft({ enabled: sub.remindAt != null, time: sub.remindAt ?? "09:00" });
    setQuadrantDraft(quadrantValue(sub.important, sub.urgent));
    setDueAtDraft(sub.dueAt ?? "");
  }

  function openSub(sub: Subproject) {
    setError("");
    setLogsOpen(false);
    setPlacingIdea(null);
    setDraggingIdeaId(null);
    setFocusIdeaId(null);
    ideaDragRef.current = null;
    setSubTodoTitle("");
    setEditingInfo(false);
    syncInfoDrafts(sub);
    setUpdateDraft("");
    setEditingLogId(null);
    setEditingLogBody("");
    const progress = progressOf(sub);
    setProgressForm({
      progress,
      progressPercent: progress === "doing"
        ? String(sub.progressPercent ?? 0)
        : sub.progressPercent == null ? "" : String(sub.progressPercent),
      log: "",
    });
    if (onRequestOpenSub) {
      onRequestOpenSub(sub.id);
      return;
    }
    setInternalOpenSubId(sub.id);
  }

  function beginEditInfo() {
    if (!opened) return;
    syncInfoDrafts(opened);
    setEditingInfo(true);
  }

  function cancelEditInfo() {
    if (!opened) return;
    syncInfoDrafts(opened);
    setEditingInfo(false);
  }

  useEffect(() => {
    setDoneOpen(false);
    setLogsOpen(false);
    setPlacingIdea(null);
    setDraggingIdeaId(null);
    setFocusIdeaId(null);
    ideaDragRef.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (openSubId == null) {
      setIdeaTags([]);
      setPlacingIdea(null);
      setDraggingIdeaId(null);
      setFocusIdeaId(null);
      ideaDragRef.current = null;
      ideaSavedBodyRef.current = new Map();
      return;
    }
    let cancelled = false;
    void api.listIdeaTags(openSubId)
      .then((tags) => {
        if (cancelled) return;
        setIdeaTags(tags);
        ideaSavedBodyRef.current = new Map(tags.map((tag) => [tag.id, tag.body]));
      })
      .catch((reason) => {
        if (!cancelled) setError(message(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [openSubId]);

  useEffect(() => {
    if (!placingIdea) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacingIdea(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingIdea]);

  useEffect(() => {
    if (focusIdeaId == null) return;
    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) return;
      const input = ideaInputRefs.current.get(focusIdeaId);
      if (!input) {
        requestAnimationFrame(tryFocus);
        return;
      }
      if (document.activeElement !== input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    };
    tryFocus();
    return () => {
      cancelled = true;
    };
  }, [focusIdeaId]);

  function beginIdeaDrag(tag: IdeaTag, event: ReactPointerEvent<HTMLElement>) {
    if (placingIdea || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (focusIdeaId === tag.id && (event.target as HTMLElement).closest("textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    ideaDragRef.current = {
      id: tag.id,
      originX: tag.posX,
      originY: tag.posY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    setDraggingIdeaId(tag.id);
    const onMove = (moveEvent: PointerEvent) => {
      const drag = ideaDragRef.current;
      const board = ideaBoardRef.current;
      if (!drag || !board) return;
      if (!drag.moved) {
        const dx = Math.abs(moveEvent.clientX - drag.startClientX);
        const dy = Math.abs(moveEvent.clientY - drag.startClientY);
        if (dx > 4 || dy > 4) drag.moved = true;
      }
      const point = ideaBoardPercent(board, moveEvent.clientX, moveEvent.clientY);
      setIdeaTags((tags) => tags.map((item) => (
        item.id === drag.id ? { ...item, posX: point.x, posY: point.y } : item
      )));
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const drag = ideaDragRef.current;
      const board = ideaBoardRef.current;
      ideaDragRef.current = null;
      setDraggingIdeaId(null);
      if (!drag || !board || !drag.moved) return;
      const point = ideaBoardPercent(board, upEvent.clientX, upEvent.clientY);
      void api.moveIdeaTag(drag.id, point.x, point.y)
        .then((next) => {
          setIdeaTags((tags) => tags.map((item) => (item.id === next.id ? next : item)));
        })
        .catch((reason) => {
          setError(message(reason));
          setIdeaTags((tags) => tags.map((item) => (
            item.id === drag.id ? { ...item, posX: drag.originX, posY: drag.originY } : item
          )));
        });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startPlacingIdea(color: string) {
    if (busy) return;
    setFocusIdeaId(null);
    setPlacingIdea({ color });
    setPlacingPos({ x: 50, y: 40 });
  }

  async function placeIdeaAt(clientX: number, clientY: number) {
    if (!placingIdea || openSubId == null || busy) return;
    const board = ideaBoardRef.current;
    if (!board) return;
    const point = ideaBoardPercent(board, clientX, clientY);
    const color = placingIdea.color;
    setBusy(true);
    try {
      const created = await api.addIdeaTag(openSubId, "", color, point.x, point.y);
      ideaSavedBodyRef.current.set(created.id, created.body);
      setIdeaTags((tags) => [...tags, created]);
      setPlacingIdea(null);
      setFocusIdeaId(created.id);
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  function saveIdeaBody(id: number, color: string, body: string) {
    const nextBody = body.trim();
    if (ideaSavedBodyRef.current.get(id) === nextBody) {
      if (body !== nextBody) {
        setIdeaTags((tags) => tags.map((item) => (
          item.id === id ? { ...item, body: nextBody } : item
        )));
      }
      return;
    }
    void api.updateIdeaTag(id, nextBody, color)
      .then((next) => {
        ideaSavedBodyRef.current.set(next.id, next.body);
        setIdeaTags((tags) => tags.map((item) => (item.id === next.id ? next : item)));
      })
      .catch((reason) => setError(message(reason)));
  }

  const mine = current ? subs.filter((sub) => sub.projectId === current.id) : [];
  const opened = mine.find((sub) => sub.id === openSubId) ?? null;
  const projectTodos = current
    ? todos.filter((item) => item.projectId === current.id && item.subprojectId == null)
    : [];
  const subTodos = opened
    ? todos.filter((item) => item.subprojectId === opened.id)
    : [];
  const activeMine = mine.filter((sub) => progressOf(sub) !== "done");
  const doneMine = mine.filter((sub) => progressOf(sub) === "done");
  const regularMine = mine.filter((sub) => sub.kind !== "periodic");
  const doingCount = regularMine.filter((sub) => progressOf(sub) === "doing").length;
  const doneCount = regularMine.filter((sub) => progressOf(sub) === "done").length;
  const openedLogs = opened
    ? logs.filter((log) => log.subprojectId === opened.id && log.kind === "work")
    : [];
  const keyProgressLogs = opened
    ? logs.filter((log) => log.subprojectId === opened.id && log.kind !== "work")
    : [];

  function pinSubTop(list: Subproject[], id: number) {
    if (!current || list[0]?.id === id) return;
    const ordered = mine.map((item) => item.id).filter((item) => item !== id);
    const insertAt = ordered.indexOf(list[0].id);
    if (insertAt < 0) return;
    ordered.splice(insertAt, 0, id);
    void run(() => api.reorderSubprojects(current.id, ordered));
  }

  function renderSubRows(list: Subproject[], canPin: boolean) {
    return (
      <div className="list">
        {list.map((sub, index) => {
          const done = progressOf(sub) === "done";
          return (
            <article className={done ? "row sub-row done" : "row sub-row"} key={sub.id}>
              <button type="button" className="row-open" onClick={() => openSub(sub)}>
                <h3>{sub.name}</h3>
                <div className="sub-meta">
                  {subMetaTags(sub).map((tag) => (
                    <span className={`sub-tag ${tag.tone}`} key={`${tag.tone}-${tag.label}`}>
                      <span className="sub-tag-dot" />
                      {tag.label}
                    </span>
                  ))}
                </div>
              </button>
              <div className="actions row-tools">
                {canPin && index > 0 && (
                  <button
                    type="button"
                    className="quiet pin-top"
                    disabled={busy}
                    aria-label="置顶"
                    onClick={() => pinSubTop(list, sub.id)}
                  >
                    置顶
                  </button>
                )}
                <button
                  type="button"
                  className="quiet row-delete"
                  aria-label="删除"
                  onClick={() => { setError(""); setDeleteSub(sub); }}
                >
                  <TrashIcon />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  function renderTodoList(items: Item[], emptyText: string) {
    if (items.length === 0) return <Empty text={emptyText} />;
    return (
      <div className="list">
        {items.map((item) => {
          const done = item.status === "done";
          return (
            <article className={done ? "row todo-row done" : "row todo-row"} key={item.id}>
              <label className="todo-check">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busy}
                  onChange={(event) => void run(() => api.setTodoDone(item.id, event.target.checked))}
                />
                <span className="todo-title">{item.title}</span>
              </label>
              <div className="actions">
                <button type="button" className="quiet todo-link-btn" disabled={busy} onClick={() => void run(() => api.dropItem(item.id))}>丢掉</button>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      {!current && (
        <>
          <h1>项目</h1>
          <p className="lead">在左侧选择一个项目，或点「新建项目」。</p>
          <ErrorText text={error} />
          {!error && <Empty text={projects.filter((project) => project.status !== "archived").length === 0 ? "还没有项目。在左侧新建一条。" : "还没有选中项目。"} />}
        </>
      )}
      {current && !opened && (
        <div className="project-page">
          <header className="project-header">
            <div className="project-header-top">
              <div className="project-heading">
                <h1>{current.name}</h1>
              </div>
              {!isAndroid() && (
                <div className="actions project-header-actions">
                  <button type="button" className="quiet project-delete" onClick={() => onAskDelete(current)}>删除项目</button>
                </div>
              )}
            </div>
            <p className="lead">{current.outcome || "还没有写描述。"}</p>
            <div className="facts">
              <span>建立于 {when(current.createdAt)}</span>
              <span>子任务 {mine.length}</span>
              <span>未完成 {doingCount + regularMine.filter((sub) => progressOf(sub) === "not_started").length}</span>
              <span>已完成 {doneCount}</span>
            </div>
            <ErrorText text={error} />
          </header>

          <section className="project-section">
            <div className="section-head">
              <h2>子任务</h2>
              <span className="section-count">{mine.length}</span>
            </div>
            {mine.length === 0 ? (
              <Empty text="还没有子任务。" />
            ) : (
              <>
                <div className="sub-group">
                  <div className="sub-group-label">未完成 · {activeMine.length}</div>
                  {activeMine.length === 0 ? <Empty text="没有未完成的子任务。" /> : renderSubRows(activeMine, true)}
                </div>
                {doneMine.length > 0 && (
                  <div className="sub-group">
                    <button
                      type="button"
                      className="sub-group-toggle"
                      aria-expanded={doneOpen}
                      onClick={() => setDoneOpen((open) => !open)}
                    >
                      <Chevron open={doneOpen} />
                      <span>已完成 · {doneMine.length}</span>
                    </button>
                    {doneOpen && renderSubRows(doneMine, false)}
                  </div>
                )}
              </>
            )}
            <button type="button" className="add-inline" onClick={openCreate}>+ 新建子任务</button>
          </section>

          <section className="project-section">
            <div className="section-head">
              <h2>待办</h2>
              <span className="section-count">{projectTodos.length}</span>
            </div>
            {renderTodoList(projectTodos, "还没有挂在本项目的待办。")}
          </section>

          <ProjectBlocked projectId={current.id} revision={revision} />
          {isAndroid() && (
            <div className="project-danger-zone">
              <button type="button" className="quiet project-delete" onClick={() => onAskDelete(current)}>
                删除项目
              </button>
            </div>
          )}
        </div>
      )}
      {current && opened && (
        <div className="project-page">
          {chromeBack && (
            <button
              type="button"
              className="back"
              onClick={() => {
                if (onRequestCloseSub) onRequestCloseSub();
                else setInternalOpenSubId(null);
              }}
            >
              返回 {current.name}
            </button>
          )}
          <header className="project-header">
            <div className="project-header-top">
              <div className="project-heading">
                <h1>{opened.name}</h1>
                <span className="status-chip">
                  {opened.status === "paused"
                    ? "暂停"
                    : opened.kind === "periodic"
                      ? "周期性"
                      : (progressLabel[progressOf(opened)] ?? subStatus[opened.status])}
                </span>
              </div>
              <div className="actions project-header-actions">
                {opened.kind !== "periodic" && (
                  <button type="button" className="quiet" onClick={() => setLogsOpen(true)}>
                    工作记录{openedLogs.length > 0 ? ` · ${openedLogs.length}` : ""}
                  </button>
                )}
                {opened.status === "paused" && (
                  <button
                    type="button"
                    onClick={() => {
                      void run(async () => {
                        if (opened.kind === "periodic") {
                          await api.setSubprojectStatus(opened.id, "active", null);
                        } else {
                          const percent = opened.progressPercent;
                          await api.setSubprojectProgress(opened.id, "doing", percent, null);
                          setProgressForm({
                            progress: "doing",
                            progressPercent: String(percent ?? 0),
                            log: "",
                          });
                        }
                      });
                    }}
                  >
                    继续进行
                  </button>
                )}
                {opened.status === "active" && (
                  <button type="button" className="quiet" onClick={() => void run(() => api.setSubprojectStatus(opened.id, "paused", null))}>
                    暂停
                  </button>
                )}
                {!editingInfo && (
                  <button type="button" className="quiet" onClick={beginEditInfo}>修改</button>
                )}
                <button type="button" className="quiet tree-delete" onClick={() => { setError(""); setDeleteSub(opened); }}>删除</button>
              </div>
            </div>
            {editingInfo ? (
              <form
                className="stack detail-form sub-info-edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  const target = opened;
                  const nextName = nameDraft.trim();
                  const nextDescription = descriptionDraft.trim();
                  if (!nextName) return;
                  if (target.kind === "periodic" && !repeatDaysDraft.split(",").some((day) => day.trim())) {
                    setError("周期性任务要选重复日期");
                    return;
                  }
                  void run(async () => {
                    const nameChanged = nextName !== target.name;
                    const descChanged = nextDescription !== (target.description ?? "").trim();
                    if (nameChanged || descChanged) {
                      await api.updateSubproject(target.id, nextName, nextDescription);
                    }
                    if (target.kind === "periodic") {
                      const nextRepeat = repeatDaysDraft;
                      const prevRepeat = target.repeatDays || "";
                      if (nextRepeat !== prevRepeat) {
                        await api.setSubprojectRepeat(target.id, nextRepeat);
                      }
                      const enabled = remindDraft.enabled;
                      const time = remindDraft.time;
                      const prevEnabled = target.remindAt != null;
                      const prevTime = target.remindAt ?? "09:00";
                      if (enabled !== prevEnabled || (enabled && time !== prevTime)) {
                        await api.setSubprojectReminder(target.id, enabled, enabled ? time : null);
                      }
                    } else {
                      const nextQuadrant = parseQuadrant(quadrantDraft);
                      const prevQuadrant = quadrantValue(target.important, target.urgent);
                      if (nextQuadrant && quadrantDraft !== prevQuadrant) {
                        await api.setSubprojectQuadrant(target.id, nextQuadrant.important, nextQuadrant.urgent);
                      }
                      const nextDue = dueAtDraft || null;
                      const prevDue = target.dueAt || null;
                      if (nextDue !== prevDue) {
                        await api.setSubprojectDue(target.id, nextDue);
                      }
                    }
                    setEditingInfo(false);
                  });
                }}
              >
                <Field label="子任务名称">
                  <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
                </Field>
                <Field label="任务描述">
                  <textarea
                    rows={3}
                    value={descriptionDraft}
                    placeholder="补充说明、验收要点或背景，可空"
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                  />
                </Field>
                {opened.kind === "periodic" ? (
                  <>
                    <Field label="周期性">
                      <DayChecks value={repeatDaysDraft} onChange={setRepeatDaysDraft} />
                    </Field>
                    <label className="check-line">
                      <span>定时提醒</span>
                      <input
                        type="checkbox"
                        checked={remindDraft.enabled}
                        onChange={(event) => setRemindDraft({ ...remindDraft, enabled: event.target.checked })}
                      />
                    </label>
                    {remindDraft.enabled && (
                      <TimeField
                        label="提醒时间"
                        value={remindDraft.time}
                        onChange={(time) => setRemindDraft({ ...remindDraft, time })}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Field label="四象限">
                      <select value={quadrantDraft} onChange={(event) => setQuadrantDraft(event.target.value)}>
                        <option value="" disabled>选择四象限</option>
                        {QUADRANT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <DateTimeField
                      label="截止时间，可空"
                      value={dueAtDraft}
                      emptyText="未设置，点这里选择"
                      onChange={setDueAtDraft}
                    />
                  </>
                )}
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary" type="submit" disabled={busy || !nameDraft.trim()}>
                    {busy ? "正在保存…" : "保存"}
                  </button>
                  <button type="button" className="quiet" onClick={cancelEditInfo}>
                    取消
                  </button>
                </div>
              </form>
            ) : (
              <>
                {opened.description.trim() ? (
                  <p className="project-desc">{opened.description}</p>
                ) : (
                  <button type="button" className="quiet add-desc" onClick={beginEditInfo}>
                    添加描述
                  </button>
                )}
                <div className="facts">
                  {subDetailFacts(opened).map((fact) => (
                    <span key={fact}>{fact}</span>
                  ))}
                </div>
              </>
            )}
            <ErrorText text={error} />
          </header>

          {opened.kind !== "periodic" && (
            <section className="project-section">
              <div className="section-head"><h2>进度</h2></div>
              <div className="stack detail-form progress-form">
                <div className="progress-status">
                  <Field label="状态">
                    <select
                      value={progressForm.progress}
                      disabled={busy}
                      onChange={(event) => {
                        const progress = event.target.value;
                        let nextPercent = progressForm.progressPercent;
                        if (progress === "doing" && nextPercent.trim() === "") nextPercent = "0";
                        setProgressForm((prev) => ({
                          ...prev,
                          progress,
                          progressPercent: progress === "doing" && prev.progressPercent.trim() === ""
                            ? "0"
                            : prev.progressPercent,
                        }));
                        const percent = progress === "doing"
                          ? Math.max(0, Math.min(100, Number(nextPercent) || 0))
                          : null;
                        void run(async () => {
                          await api.setSubprojectProgress(opened.id, progress, percent, null);
                        });
                      }}
                    >
                      <option value="not_started">未开始</option>
                      <option value="doing">进行中</option>
                      <option value="done">已完成</option>
                    </select>
                  </Field>
                  {progressForm.progress === "doing" && (
                    <PercentSlider
                      value={Number(progressForm.progressPercent) || 0}
                      onChange={(value) => setProgressForm((prev) => ({ ...prev, progressPercent: String(value) }))}
                      onCommit={(value) => {
                        const percent = Math.max(0, Math.min(100, value));
                        setProgressForm((prev) => ({ ...prev, progressPercent: String(percent) }));
                        void run(async () => {
                          await api.setSubprojectProgress(opened.id, "doing", percent, null);
                        });
                      }}
                    />
                  )}
                </div>
                <Field label="工作日志，可空">
                  <div className="log-with-save">
                    <textarea
                      className="log-input"
                      rows={1}
                      placeholder="这次做了什么，可留空"
                      value={progressForm.log}
                      onChange={(event) => setProgressForm((prev) => ({ ...prev, log: event.target.value }))}
                    />
                    {progressForm.log.trim() !== "" && (
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => {
                          const body = progressForm.log.trim();
                          if (!body) return;
                          const progress = progressForm.progress;
                          const percent = progress === "doing"
                            ? Math.max(0, Math.min(100, Number(progressForm.progressPercent) || 0))
                            : null;
                          void run(async () => {
                            await api.setSubprojectProgress(opened.id, progress, percent, body);
                            setProgressForm((prev) => ({ ...prev, log: "" }));
                          });
                        }}
                      >
                        {busy ? "保存中…" : "保存"}
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            </section>
          )}

          {opened.kind !== "periodic" && (
            <section className="project-section">
              <div className="section-head">
                <h2>关键进展</h2>
                <button
                  type="button"
                  className="quiet section-edit"
                  onClick={() => {
                    setUpdateDraft("");
                    setKeyProgressOpen(true);
                  }}
                >
                  追加
                </button>
              </div>
              <div className="detail-form progress-section">
              {(() => {
                const chain = keyProgressLogs.slice().reverse();
                if (chain.length === 0) {
                  return <Empty text="还没有关键进展。点右上角「追加」写一条。" />;
                }
                return (
                  <div className="progress-chain">
                    {chain.map((log, index) => (
                      <div className="progress-chain-item" key={log.id}>
                        {index > 0 && <span className="progress-arrow" aria-hidden>→</span>}
                        {editingLogId === log.id ? (
                          <form
                            className="progress-step progress-step-edit"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const body = editingLogBody.trim();
                              if (!body) return;
                              void run(async () => {
                                await api.updateWorkLog(log.id, body);
                                setEditingLogId(null);
                                setEditingLogBody("");
                              });
                            }}
                          >
                            <textarea
                              className="log-input"
                              rows={1}
                              value={editingLogBody}
                              onChange={(event) => setEditingLogBody(event.target.value)}
                              aria-label="编辑关键进展"
                            />
                            <div className="actions log-actions">
                              <button className="primary" type="submit" disabled={busy || !editingLogBody.trim()}>保存</button>
                              <button type="button" className="quiet" onClick={() => { setEditingLogId(null); setEditingLogBody(""); }}>取消</button>
                              <button
                                type="button"
                                className="quiet tree-delete"
                                onClick={() => {
                                  void run(async () => {
                                    await api.deleteWorkLog(log.id);
                                    setEditingLogId(null);
                                    setEditingLogBody("");
                                  });
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="progress-step"
                            title={logStamp(log)}
                            onClick={() => {
                              setEditingLogId(log.id);
                              setEditingLogBody(log.body);
                            }}
                          >
                            <span className="progress-step-time">{when(log.createdAt)}</span>
                            <span className="progress-step-body">{log.body.trim() || "（无文字）"}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
              </div>
            </section>
          )}

          <section className="project-section">
            <div className="section-head">
              <h2>灵感标签板</h2>
              <span className="section-count">{ideaTags.length}</span>
            </div>
            <div className="idea-board-palette" role="group" aria-label="添加灵感标签">
              {IDEA_TAG_COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`idea-swatch idea-color-${option.value}${placingIdea?.color === option.value ? " selected" : ""}`}
                  disabled={busy}
                  title={`添加${option.label}便签`}
                  aria-label={`添加${option.label}便签`}
                  aria-pressed={placingIdea?.color === option.value}
                  onClick={() => startPlacingIdea(option.value)}
                />
              ))}
              {placingIdea && (
                <span className="idea-board-hint-inline">点板上放下，Esc 取消</span>
              )}
            </div>
            <div
              ref={ideaBoardRef}
              className={`idea-board${placingIdea ? " placing" : ""}${draggingIdeaId != null ? " dragging" : ""}`}
              onPointerMove={(event) => {
                if (!placingIdea) return;
                const board = ideaBoardRef.current;
                if (!board) return;
                setPlacingPos(ideaBoardPercent(board, event.clientX, event.clientY));
              }}
              onPointerDown={(event) => {
                if (!placingIdea || event.button !== 0) return;
                if ((event.target as HTMLElement).closest(".idea-card")) return;
                event.preventDefault();
                void placeIdeaAt(event.clientX, event.clientY);
              }}
            >
              {ideaTags.length === 0 && !placingIdea && (
                <div className="idea-board-empty">点上方色块贴一张灵感</div>
              )}
              {ideaTags.map((tag) => (
                <div
                  key={tag.id}
                  className={`idea-card idea-color-${tag.color}${draggingIdeaId === tag.id ? " dragging" : ""}${focusIdeaId === tag.id ? " editing" : ""}`}
                  style={{
                    left: `${tag.posX}%`,
                    top: `${tag.posY}%`,
                    zIndex: draggingIdeaId === tag.id || focusIdeaId === tag.id ? 999 : Math.max(1, tag.zIndex),
                  }}
                  onPointerDown={(event) => beginIdeaDrag(tag, event)}
                  onDoubleClick={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    setFocusIdeaId(tag.id);
                  }}
                >
                  <button
                    type="button"
                    className="idea-card-delete"
                    aria-label="删除便签"
                    onClick={() => {
                      void run(async () => {
                        await api.deleteIdeaTag(tag.id);
                        ideaSavedBodyRef.current.delete(tag.id);
                        setIdeaTags((tags) => tags.filter((item) => item.id !== tag.id));
                        if (focusIdeaId === tag.id) setFocusIdeaId(null);
                      });
                    }}
                  >
                    <span aria-hidden>×</span>
                  </button>
                  {focusIdeaId === tag.id ? (
                    <textarea
                      className="idea-card-body"
                      rows={2}
                      placeholder="写点灵感…"
                      value={tag.body}
                      aria-label="灵感内容"
                      ref={(node) => {
                        if (node) ideaInputRefs.current.set(tag.id, node);
                        else ideaInputRefs.current.delete(tag.id);
                      }}
                      onChange={(event) => {
                        const body = event.target.value;
                        setIdeaTags((tags) => tags.map((item) => (
                          item.id === tag.id ? { ...item, body } : item
                        )));
                      }}
                      onBlur={(event) => {
                        const body = event.target.value;
                        setFocusIdeaId(null);
                        saveIdeaBody(tag.id, tag.color, body);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <div className={`idea-card-body${tag.body.trim() ? "" : " empty"}`}>
                      {tag.body.trim() || "写点灵感…"}
                    </div>
                  )}
                </div>
              ))}
              {placingIdea && (
                <div
                  className={`idea-card idea-color-${placingIdea.color} ghost`}
                  style={{ left: `${placingPos.x}%`, top: `${placingPos.y}%`, zIndex: 1000 }}
                >
                  <span className="idea-card-body">写点灵感…</span>
                </div>
              )}
            </div>
          </section>

          <section className="project-section">
            <div className="section-head">
              <h2>待办</h2>
              <span className="section-count">{subTodos.length}</span>
            </div>
            <form
              className="todo-compose"
              onSubmit={(event) => {
                event.preventDefault();
                const nextTitle = subTodoTitle.trim();
                if (!nextTitle || !opened || !current) return;
                void run(async () => {
                  await api.saveItem({
                    kind: "todo",
                    title: nextTitle,
                    notes: "",
                    projectId: current.id,
                    subprojectId: opened.id,
                    important: null,
                    urgent: null,
                    dueAt: null,
                    estimateMin: null,
                    repeatDays: null,
                    windowStart: null,
                    windowEnd: null,
                    graceMin: null,
                    interruptAfterGrace: false,
                    waitingOn: null,
                    followUpAt: null,
                  });
                  setSubTodoTitle("");
                });
              }}
            >
              <div className="todo-compose-main">
                <input
                  value={subTodoTitle}
                  placeholder="给这条子任务加一条待办"
                  onChange={(event) => setSubTodoTitle(event.target.value)}
                  aria-label="子任务待办标题"
                />
                <button className="primary" type="submit" disabled={busy || !subTodoTitle.trim()}>
                  添加
                </button>
              </div>
            </form>
            {renderTodoList(subTodos, "还没有挂在这条子任务上的待办。")}
          </section>

          {logsOpen && opened.kind !== "periodic" && (
            <Dialog title="工作记录" onClose={() => setLogsOpen(false)}>
              {openedLogs.length === 0 ? (
                <Empty text="还没有工作日志。调整进度时可填写，之后会留在这里。" />
              ) : (
                <ul className="log-history dialog-logs">
                  {openedLogs.map((log) => (
                    <li key={log.id}>
                      <span>{logStamp(log)}</span>
                      {log.body.trim() || "（无文字）"}
                    </li>
                  ))}
                </ul>
              )}
              <div className="actions">
                <button type="button" className="primary" onClick={() => setLogsOpen(false)}>关闭</button>
              </div>
            </Dialog>
          )}

          {keyProgressOpen && opened.kind !== "periodic" && (
            <Dialog
              title="追加关键进展"
              onClose={() => {
                setKeyProgressOpen(false);
                setUpdateDraft("");
              }}
            >
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const target = opened;
                  const body = updateDraft.trim();
                  if (!body) return;
                  void run(async () => {
                    await api.addWorkLog(target.id, body);
                    setUpdateDraft("");
                    setKeyProgressOpen(false);
                  });
                }}
              >
                <Field label="关键进展">
                  <textarea
                    className="log-input"
                    rows={1}
                    autoFocus
                    placeholder="这一步做到哪里了"
                    value={updateDraft}
                    onChange={(event) => setUpdateDraft(event.target.value)}
                  />
                </Field>
                <div className="actions">
                  <button className="primary" type="submit" disabled={busy || !updateDraft.trim()}>
                    {busy ? "正在保存…" : "追加"}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      setKeyProgressOpen(false);
                      setUpdateDraft("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            </Dialog>
          )}
        </div>
      )}
      {createSub && current && (
        <Dialog title="新建子任务" onClose={() => setCreateSub(false)}>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const progressPercent = subForm.kind === "regular" && subForm.progress === "doing"
                ? Math.max(0, Math.min(100, Number(subForm.progressPercent) || 0))
                : null;
              const quadrant = parseQuadrant(subForm.quadrant);
              await api.createSubproject({
                projectId: current.id,
                kind: subForm.kind,
                name: subForm.name,
                description: subForm.description,
                important: quadrant?.important ?? true,
                urgent: quadrant?.urgent ?? false,
                progress: subForm.kind === "regular" ? subForm.progress : "",
                dueAt: subForm.kind === "regular" ? subForm.dueAt || null : null,
                repeatDays: subForm.kind === "periodic" ? subForm.repeatDays : null,
                remind: subForm.kind === "periodic" && subForm.remind,
                remindAt: subForm.kind === "periodic" && subForm.remind ? subForm.remindAt : null,
                progressPercent,
              });
              setSubForm(emptySubForm);
              setCreateSub(false);
            });
          }}>
            <div className="choice" role="group" aria-label="子任务类型">
              <button type="button" aria-pressed={subForm.kind === "regular"} onClick={() => setSubForm({ ...subForm, kind: "regular" })}>常规任务</button>
              <button type="button" aria-pressed={subForm.kind === "periodic"} onClick={() => setSubForm({ ...subForm, kind: "periodic" })}>周期性任务</button>
            </div>
            {subForm.kind === "regular" ? (
              <>
                <Field label="名称"><input autoFocus value={subForm.name} onChange={(event) => setSubForm({ ...subForm, name: event.target.value })} /></Field>
                <Field label="任务描述">
                  <textarea
                    rows={3}
                    value={subForm.description}
                    placeholder="补充说明、验收要点或背景，可空"
                    onChange={(event) => setSubForm({ ...subForm, description: event.target.value })}
                  />
                </Field>
                <Field label="四象限">
                  <select value={subForm.quadrant} onChange={(event) => setSubForm({ ...subForm, quadrant: event.target.value })}>
                    {QUADRANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="进度">
                  <select
                    value={subForm.progress}
                    onChange={(event) => {
                      const progress = event.target.value;
                      setSubForm({
                        ...subForm,
                        progress,
                        progressPercent: progress === "doing"
                          ? subForm.progressPercent.trim() !== "" ? subForm.progressPercent : "0"
                          : subForm.progressPercent,
                      });
                    }}
                  >
                    <option value="not_started">未开始</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </Field>
                {subForm.progress === "doing" && (
                  <PercentSlider
                    value={Number(subForm.progressPercent) || 0}
                    onChange={(value) => setSubForm({ ...subForm, progressPercent: String(value) })}
                  />
                )}
                <DateTimeField label="截止时间，可空" value={subForm.dueAt} emptyText="未设置，点这里选择" onChange={(dueAt) => setSubForm({ ...subForm, dueAt })} />
              </>
            ) : (
              <>
                <Field label="标题"><input autoFocus value={subForm.name} onChange={(event) => setSubForm({ ...subForm, name: event.target.value })} /></Field>
                <Field label="任务描述">
                  <textarea
                    rows={3}
                    value={subForm.description}
                    placeholder="补充说明，可空"
                    onChange={(event) => setSubForm({ ...subForm, description: event.target.value })}
                  />
                </Field>
                <Field label="重复日期"><DayChecks value={subForm.repeatDays} onChange={(repeatDays) => setSubForm({ ...subForm, repeatDays })} /></Field>
                <label className="check-line">
                  <span>定时提醒</span>
                  <input type="checkbox" checked={subForm.remind} onChange={(event) => setSubForm({ ...subForm, remind: event.target.checked })} />
                </label>
                {subForm.remind && (
                  <TimeField label="提醒时间" value={subForm.remindAt} onChange={(remindAt) => setSubForm({ ...subForm, remindAt })} />
                )}
              </>
            )}
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setCreateSub(false)}>取消</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? "正在建立…" : "建立"}</button>
            </div>
          </form>
        </Dialog>
      )}
      {deleteSub && (
        <Dialog title="删除子任务" onClose={() => setDeleteSub(null)}>
          <p>删除「{deleteSub.name}」后，它的下一步和相关任务也会去掉，不能恢复。</p>
          <ErrorText text={error} />
          <div className="actions">
            <button type="button" className="quiet" onClick={() => setDeleteSub(null)}>取消</button>
            <button type="button" className="danger" disabled={busy} onClick={() => {
              const target = deleteSub;
              void run(async () => {
                await api.deleteSubproject(target.id);
                setDeleteSub(null);
                if (openSubId === target.id) {
                  if (onRequestCloseSub) onRequestCloseSub();
                  else setInternalOpenSubId(null);
                }
              });
            }}>{busy ? "正在删除…" : "删除"}</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
