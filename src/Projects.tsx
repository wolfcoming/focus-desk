import { useEffect, useState, type FormEvent } from "react";
import { api, message } from "./api";
import { ProjectBlocked } from "./ProjectBlocked";
import type { Item, Project, Subproject, WorkLog } from "./types";
import { parseQuadrant, quadrantValue, QUADRANT_OPTIONS, subStatus } from "./types";
import { Chevron, DateTimeField, DayChecks, Dialog, Empty, ErrorText, Field, PercentSlider, TimeField, when } from "./widgets";

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

function subMeta(sub: Subproject) {
  if (sub.kind === "periodic") {
    const state = sub.status === "paused" ? "暂停 · " : "";
    return `${state}周期性 · ${repeatLabel(sub.repeatDays)} · ${sub.remindAt ? `${sub.remindAt} 提醒` : "不定时提醒"}`;
  }
  const progress = sub.status === "paused"
    ? "暂停"
    : (progressLabel[sub.progress] ?? subStatus[sub.status]);
  const percent = sub.status !== "paused" && sub.progress === "doing" && sub.progressPercent != null ? ` ${sub.progressPercent}%` : "";
  const quadrant = sub.quadrant ?? (sub.important == null ? "" : sub.important ? "重要" : "不重要");
  return `${progress}${percent}${quadrant ? ` · ${quadrant}` : ""}${sub.dueAt ? ` · 截止 ${when(sub.dueAt)}` : ""}`;
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
}: {
  revision: number;
  selectedId: number | null;
  projectTick: number;
  focusSubId?: number | null;
  onFocusedSub?: () => void;
  onAskDelete: (project: Project) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [todos, setTodos] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createSub, setCreateSub] = useState(false);
  const [openSubId, setOpenSubId] = useState<number | null>(null);
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
    if (focusSubId != null) return;
    setOpenSubId(null);
  }, [selectedId, projectTick]);

  useEffect(() => {
    if (focusSubId == null) return;
    const target = subs.find((sub) => sub.id === focusSubId);
    if (!target) return;
    openSub(target);
    onFocusedSub?.();
  }, [focusSubId, subs, projectTick]);

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
    setOpenSubId(sub.id);
    setLogsOpen(false);
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
  }, [selectedId]);

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

  function moveSub(list: Subproject[], index: number, dir: -1 | 1) {
    if (!current) return;
    const target = list[index + dir];
    if (!target) return;
    const ordered = mine.map((item) => item.id);
    const from = ordered.indexOf(list[index].id);
    const to = ordered.indexOf(target.id);
    if (from < 0 || to < 0) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    void run(() => api.reorderSubprojects(current.id, ordered));
  }

  function renderSubRows(list: Subproject[], reorder: boolean) {
    return (
      <div className="list">
        {list.map((sub, index) => (
          <article className="row sub-row" key={sub.id}>
            <button type="button" className="row-open" onClick={() => openSub(sub)}>
              <h3>{sub.name}</h3>
              <div className="meta">{subMeta(sub)}</div>
            </button>
            <div className="actions row-tools">
              {reorder && (
                <>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || index === 0}
                    aria-label="上移"
                    onClick={() => moveSub(list, index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || index === list.length - 1}
                    aria-label="下移"
                    onClick={() => moveSub(list, index, 1)}
                  >
                    ↓
                  </button>
                </>
              )}
              <button type="button" className="quiet tree-delete" onClick={() => { setError(""); setDeleteSub(sub); }}>删除</button>
            </div>
          </article>
        ))}
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
                <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api.dropItem(item.id))}>丢掉</button>
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
              <div className="actions project-header-actions">
                <button type="button" className="quiet tree-delete" onClick={() => onAskDelete(current)}>删除项目</button>
              </div>
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
            <button type="button" className="add-inline" onClick={openCreate}>新建子任务</button>
          </section>

          <section className="project-section">
            <div className="section-head">
              <h2>待办</h2>
              <span className="section-count">{projectTodos.length}</span>
            </div>
            {renderTodoList(projectTodos, "还没有挂在本项目的待办。")}
          </section>

          <ProjectBlocked projectId={current.id} revision={revision} />
        </div>
      )}
      {current && opened && (
        <div className="project-page">
          <button type="button" className="back" onClick={() => setOpenSubId(null)}>返回 {current.name}</button>
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
                <button type="button" className="quiet tree-delete" onClick={() => { setError(""); setDeleteSub(opened); }}>删除</button>
              </div>
            </div>
            <p className="lead">{subMeta(opened)}</p>
            <ErrorText text={error} />
          </header>
          <section className="project-section">
            <div className="section-head">
              <h2>基本信息</h2>
              {!editingInfo && (
                <button type="button" className="quiet section-edit" onClick={beginEditInfo}>
                  修改
                </button>
              )}
            </div>
            {editingInfo ? (
              <form
                className="stack detail-form"
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
              <div className="info-readonly">
                <div className="info-block">
                  <div className="info-label">名称</div>
                  <div className="info-value">{opened.name}</div>
                </div>
                <div className="info-block">
                  <div className="info-label">描述</div>
                  <div className="info-value">{opened.description.trim() || "还没有写描述。"}</div>
                </div>
                {opened.kind === "periodic" ? (
                  <>
                    <div className="info-block">
                      <div className="info-label">周期性</div>
                      <div className="info-value">{repeatLabel(opened.repeatDays)}</div>
                    </div>
                    <div className="info-block">
                      <div className="info-label">提醒</div>
                      <div className="info-value">{opened.remindAt ? `${opened.remindAt} 定时提醒` : "不定时提醒"}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="info-block">
                      <div className="info-label">四象限</div>
                      <div className="info-value">
                        {QUADRANT_OPTIONS.find((option) => option.value === quadrantValue(opened.important, opened.urgent))?.label
                          ?? opened.quadrant
                          ?? "未设置"}
                      </div>
                    </div>
                    <div className="info-block">
                      <div className="info-label">截止时间</div>
                      <div className="info-value">{opened.dueAt ? when(opened.dueAt) : "未设置"}</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {opened.kind !== "periodic" && (
            <section className="project-section">
              <div className="section-head"><h2>进度</h2></div>
              <form className="stack detail-form" onSubmit={(event) => {
                event.preventDefault();
                const target = opened;
                void run(async () => {
                  const progressPercent = progressForm.progress === "doing"
                    ? Math.max(0, Math.min(100, Number(progressForm.progressPercent) || 0))
                    : null;
                  await api.setSubprojectProgress(target.id, progressForm.progress, progressPercent, progressForm.log.trim() || null);
                  setProgressForm({
                    progress: progressForm.progress,
                    progressPercent: progressForm.progress === "doing" ? String(progressPercent ?? 0) : "",
                    log: "",
                  });
                });
              }}>
                <Field label="进度">
                  <select
                    value={progressForm.progress}
                    onChange={(event) => {
                      const progress = event.target.value;
                      setProgressForm({
                        ...progressForm,
                        progress,
                        progressPercent: progress === "doing"
                          ? progressForm.progressPercent.trim() !== "" ? progressForm.progressPercent : "0"
                          : progressForm.progressPercent,
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
                    onChange={(value) => setProgressForm({ ...progressForm, progressPercent: String(value) })}
                  />
                )}
                <Field label="工作日志，可空">
                  <textarea
                    rows={3}
                    placeholder="这次调整进度时做了什么，可留空。保存后可在工作记录里回看。"
                    value={progressForm.log}
                    onChange={(event) => setProgressForm({ ...progressForm, log: event.target.value })}
                  />
                </Field>
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存"}</button>
                </div>
              </form>
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
                              rows={2}
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
              <h2>待办</h2>
              <span className="section-count">{subTodos.length}</span>
            </div>
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
                    rows={4}
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
                setOpenSubId((currentId) => currentId === target.id ? null : currentId);
              });
            }}>{busy ? "正在删除…" : "删除"}</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
