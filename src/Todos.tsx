import { useEffect, useMemo, useState } from "react";
import { api, message } from "./api";
import type { Item, ItemDraft, Project, Subproject } from "./types";
import { parseQuadrant, quadrantValue, QUADRANT_OPTIONS } from "./types";
import { AiBusy, AiThinking, DateTimeField, Dialog, Empty, ErrorText, Field, TodoScheduleBar, when } from "./widgets";

const emptyDraft = (title = "", id: number | null = null): ItemDraft => ({
  id,
  kind: "todo",
  title,
  notes: "",
  projectId: null,
  subprojectId: null,
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

function asLinkKind(kind: string) {
  if (kind === "waiting") return "waiting";
  if (kind === "task") return "task";
  return "todo";
}

type TodoDetailForm = {
  title: string;
  notes: string;
  projectId: string;
  subId: string;
  dueAt: string | null;
  remindAt: string | null;
};

function detailFromItem(item: Item): TodoDetailForm {
  return {
    title: item.title,
    notes: item.notes,
    projectId: item.projectId != null ? String(item.projectId) : "",
    subId: item.subprojectId != null ? String(item.subprojectId) : "",
    dueAt: item.dueAt,
    remindAt: item.followUpAt,
  };
}

export function Todos({
  revision,
  onOpen,
}: {
  revision: number;
  onOpen: (projectId: number) => void;
}) {
  const [todos, setTodos] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [subId, setSubId] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [showAffil, setShowAffil] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TodoDetailForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Item | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [note, setNote] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const [board, nextProjects, nextSubs] = await Promise.all([
        api.today(),
        api.listProjects(),
        api.listSubprojects(null),
      ]);
      setTodos(board.todos);
      setProjects(nextProjects.filter((project) => project.status !== "archived"));
      setSubs(nextSubs);
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  useEffect(() => {
    void load();
  }, [revision]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  const opened = openId != null ? todos.find((item) => item.id === openId) ?? null : null;

  useEffect(() => {
    if (openId == null) return;
    const current = todos.find((item) => item.id === openId);
    if (!current) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setDetail((prev) => (prev ? prev : detailFromItem(current)));
  }, [todos, openId]);

  const projectSubs = useMemo(() => {
    const id = Number(projectId);
    if (!id) return [];
    return subs.filter((sub) => sub.projectId === id && sub.status !== "done");
  }, [subs, projectId]);

  const detailSubs = useMemo(() => {
    const id = Number(detail?.projectId);
    if (!id) return [];
    return subs.filter((sub) => sub.projectId === id && (sub.status !== "done" || String(sub.id) === detail?.subId));
  }, [subs, detail?.projectId, detail?.subId]);

  const draftSubs = useMemo(() => {
    if (!draft?.projectId) return [];
    return subs.filter((sub) => sub.projectId === draft.projectId && sub.status !== "done");
  }, [subs, draft?.projectId]);

  useEffect(() => {
    if (!subId) return;
    if (!projectSubs.some((sub) => String(sub.id) === subId)) setSubId("");
  }, [projectSubs, subId]);

  const affilSummary = (() => {
    if (!projectId) return "不挂靠";
    const project = projects.find((item) => String(item.id) === projectId);
    const name = project?.name ?? "项目";
    if (!subId) return name;
    const sub = projectSubs.find((item) => String(item.id) === subId);
    return sub ? `${name} · ${sub.name}` : name;
  })();

  function affiliationLabel(item: Item) {
    if (item.subprojectName) return `${item.projectName ?? "项目"} · ${item.subprojectName}`;
    if (item.projectName) return item.projectName;
    return null;
  }

  function openTodo(item: Item) {
    setError("");
    setOpenId(item.id);
    setDetail(detailFromItem(item));
  }

  function closeTodo() {
    setOpenId(null);
    setDetail(null);
    setError("");
  }

  async function saveDetail() {
    if (!opened || !detail) return;
    const nextTitle = detail.title.trim();
    if (!nextTitle || busy) return;
    setBusy(true);
    try {
      await api.saveItem({
        id: opened.id,
        kind: "todo",
        title: nextTitle,
        notes: detail.notes.trim(),
        projectId: detail.projectId ? Number(detail.projectId) : null,
        subprojectId: detail.subId ? Number(detail.subId) : null,
        important: null,
        urgent: null,
        dueAt: detail.dueAt,
        estimateMin: null,
        repeatDays: null,
        windowStart: null,
        windowEnd: null,
        graceMin: null,
        interruptAfterGrace: false,
        waitingOn: null,
        followUpAt: detail.remindAt,
      });
      window.dispatchEvent(new Event("desk-changed"));
      await load();
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  function closeLink() {
    setLinkTarget(null);
    setDraft(null);
    setNote("");
    setThinking(null);
    setBusyId(null);
  }

  function startManual(item: Item) {
    setThinking(null);
    setError("");
    setDraft({
      ...emptyDraft(item.title, item.id),
      notes: item.notes,
    });
    setNote("手填关联：可挂成待办，或整理成项目任务 / 阻塞项。");
    setLinkTarget(null);
  }

  async function startAi(item: Item) {
    if (busyId != null) return;
    setBusyId(item.id);
    setThinking(null);
    setError("");
    setLinkTarget(null);
    try {
      const result = await api.clarify(item.id);
      const kind = asLinkKind(result.draft.kind === "waiting" || result.draft.kind === "task" ? result.draft.kind : "todo");
      setDraft({
        ...result.draft,
        id: item.id,
        kind,
        projectId: result.draft.projectId,
        subprojectId: kind === "todo" ? result.draft.subprojectId : null,
        estimateMin: null,
        waitingOn: kind === "waiting" ? result.draft.waitingOn : null,
        followUpAt: kind === "waiting" ? result.draft.followUpAt : null,
        important: kind === "task" ? result.draft.important : null,
        urgent: kind === "task" ? result.draft.urgent : null,
        dueAt: kind === "task" ? result.draft.dueAt : null,
      });
      setNote(result.note);
      setThinking(result.thinking ?? null);
    } catch (reason) {
      setError(message(reason));
      setDraft(emptyDraft(item.title, item.id));
      setNote("助手暂时不可用，改为手填。");
    } finally {
      setBusyId(null);
    }
  }

  function setKind(kind: string) {
    if (!draft) return;
    const next = asLinkKind(kind);
    setDraft({
      ...draft,
      kind: next,
      subprojectId: next === "todo" ? draft.subprojectId : null,
      estimateMin: null,
      important: next === "task" ? draft.important : null,
      urgent: next === "task" ? draft.urgent : null,
      dueAt: next === "task" ? draft.dueAt : null,
      waitingOn: next === "waiting" ? draft.waitingOn : null,
      followUpAt: next === "waiting" ? draft.followUpAt : null,
    });
  }

  async function saveLink() {
    if (!draft?.id) return;
    const kind = asLinkKind(draft.kind);
    try {
      await api.saveItem({
        ...draft,
        kind,
        projectId: draft.projectId,
        subprojectId: kind === "todo" ? draft.subprojectId : null,
        estimateMin: null,
      });
      closeLink();
      window.dispatchEvent(new Event("desk-changed"));
      await load();
      setError("");
      if (kind !== "todo") closeTodo();
      else if (draft.id === openId) {
        setDetail({
          title: draft.title,
          notes: draft.notes,
          projectId: draft.projectId != null ? String(draft.projectId) : "",
          subId: draft.subprojectId != null ? String(draft.subprojectId) : "",
          dueAt: draft.dueAt,
          remindAt: draft.followUpAt,
        });
      }
    } catch (reason) {
      setError(message(reason));
    }
  }

  const kind = draft ? asLinkKind(draft.kind) : "todo";
  const openedDone = opened?.status === "done";
  const openedLoose = opened != null && !openedDone && opened.projectId == null && opened.subprojectId == null;

  if (opened && detail) {
    return (
      <section>
        <div className="project-page">
          <button type="button" className="back" onClick={closeTodo}>返回待办</button>
          <header className="project-header">
            <div className="project-header-top">
              <div className="project-heading">
                <h1>{opened.title}</h1>
                <span className="status-chip">{openedDone ? "已完成" : "待办"}</span>
              </div>
              <div className="actions project-header-actions">
                {openedLoose && (
                  <button type="button" className="quiet" disabled={busyId != null} onClick={() => { setError(""); setLinkTarget(opened); }}>
                    整理
                  </button>
                )}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => void run(async () => {
                    await api.setTodoDone(opened.id, !openedDone);
                    window.dispatchEvent(new Event("desk-changed"));
                  })}
                >
                  {openedDone ? "重新打开" : "标记完成"}
                </button>
                <button
                  type="button"
                  className="quiet tree-delete"
                  onClick={() => void run(async () => {
                    await api.dropItem(opened.id);
                    window.dispatchEvent(new Event("desk-changed"));
                    closeTodo();
                  })}
                >
                  丢掉
                </button>
              </div>
            </div>
            <ErrorText text={error} />
          </header>

          <section className="project-section">
            <div className="section-head"><h2>配置</h2></div>
            <form
              className="stack detail-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveDetail();
              }}
            >
              <Field label="标题">
                <input
                  value={detail.title}
                  onChange={(event) => setDetail({ ...detail, title: event.target.value })}
                />
              </Field>
              <Field label="备注，可空">
                <textarea
                  rows={3}
                  value={detail.notes}
                  placeholder="补充说明"
                  onChange={(event) => setDetail({ ...detail, notes: event.target.value })}
                />
              </Field>
              <DateTimeField
                label="截止时间，可空"
                value={detail.dueAt ?? ""}
                emptyText="未设置，点这里选择"
                onChange={(value) => setDetail({ ...detail, dueAt: value || null })}
              />
              <DateTimeField
                label="提醒时间，可空"
                value={detail.remindAt ?? ""}
                emptyText="未设置，点这里选择"
                onChange={(value) => setDetail({ ...detail, remindAt: value || null })}
              />
              <Field label="挂靠项目">
                <select
                  value={detail.projectId}
                  onChange={(event) => setDetail({ ...detail, projectId: event.target.value, subId: "" })}
                >
                  <option value="">不挂项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="挂靠子任务，可空">
                <select
                  value={detail.subId}
                  disabled={!detail.projectId}
                  onChange={(event) => setDetail({ ...detail, subId: event.target.value })}
                >
                  <option value="">{detail.projectId ? "整个项目" : "先选项目"}</option>
                  {detailSubs.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </Field>
              {detail.projectId && (
                <p className="note">
                  <button type="button" className="quiet todo-affil-link" onClick={() => onOpen(Number(detail.projectId))}>
                    打开项目详情
                  </button>
                </p>
              )}
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="primary" type="submit" disabled={busy || !detail.title.trim()}>
                  {busy ? "正在保存…" : "保存"}
                </button>
              </div>
            </form>
          </section>
        </div>

        {busyId != null && <AiBusy label="正在辅助关联这条待办" />}

        {linkTarget && (
          <Dialog title="关联" onClose={closeLink}>
            <p className="note">「{linkTarget.title}」还没挂项目。选手动填写，或让助手先预填。</p>
            <div className="actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="primary" onClick={() => startManual(linkTarget)}>手动</button>
              <button type="button" disabled={busyId != null} onClick={() => void startAi(linkTarget)}>AI 辅助</button>
              <button type="button" className="quiet" onClick={closeLink}>取消</button>
            </div>
          </Dialog>
        )}

        {draft && (
          <Dialog title="关联到项目" onClose={closeLink}>
            <div className="stack">
              <p className="note">{note}</p>
              <AiThinking text={thinking} />
              <Field label="标题"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
              <Field label="整理为">
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="todo">仍为待办（挂靠）</option>
                  <option value="task">项目任务</option>
                  <option value="waiting">阻塞项</option>
                </select>
              </Field>
              <Field label="选择项目">
                <select
                  value={draft.projectId ?? ""}
                  onChange={(event) => setDraft({
                    ...draft,
                    projectId: event.target.value ? Number(event.target.value) : null,
                    subprojectId: null,
                  })}
                >
                  <option value="" disabled>选择大项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </Field>
              {kind === "todo" && (
                <Field label="子任务，可空">
                  <select
                    value={draft.subprojectId ?? ""}
                    disabled={!draft.projectId}
                    onChange={(event) => setDraft({
                      ...draft,
                      subprojectId: event.target.value ? Number(event.target.value) : null,
                    })}
                  >
                    <option value="">整个项目</option>
                    {draftSubs.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "task" && (
                <>
                  <Field label="四象限">
                    <select
                      value={quadrantValue(draft.important, draft.urgent)}
                      onChange={(event) => {
                        const next = parseQuadrant(event.target.value);
                        setDraft({
                          ...draft,
                          important: next?.important ?? null,
                          urgent: next?.urgent ?? null,
                        });
                      }}
                    >
                      <option value="" disabled>选择四象限</option>
                      {QUADRANT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <DateTimeField label="截止时间，可空" value={draft.dueAt ?? ""} emptyText="未设置，点这里选择" onChange={(value) => setDraft({ ...draft, dueAt: value || null })} />
                </>
              )}
              {kind === "waiting" && (
                <>
                  <Field label="在等什么"><input value={draft.waitingOn ?? ""} onChange={(event) => setDraft({ ...draft, waitingOn: event.target.value })} /></Field>
                  <DateTimeField label="何时再问" value={draft.followUpAt ?? ""} emptyText="未设置，点这里选择" onChange={(followUpAt) => setDraft({ ...draft, followUpAt: followUpAt || null })} />
                </>
              )}
              <Field label="备注"><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
              <ErrorText text={error} />
              <div className="actions">
                <button type="button" className="quiet" onClick={closeLink}>取消</button>
                <button type="button" className="primary" onClick={() => void saveLink()}>保存</button>
              </div>
            </div>
          </Dialog>
        )}
      </section>
    );
  }

  return (
    <section>
      <h1>待办</h1>
      <p className="lead todos-lead">轻量勾选清单：勾选即完成；未挂靠的可关联到项目，或整理成任务 / 阻塞项。</p>
      <ErrorText text={error} />
      <form
        className="todo-compose"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTitle = title.trim();
          if (!nextTitle) return;
          void run(async () => {
            await api.saveItem({
              kind: "todo",
              title: nextTitle,
              notes: "",
              projectId: projectId ? Number(projectId) : null,
              subprojectId: subId ? Number(subId) : null,
              important: null,
              urgent: null,
              dueAt,
              estimateMin: null,
              repeatDays: null,
              windowStart: null,
              windowEnd: null,
              graceMin: null,
              interruptAfterGrace: false,
              waitingOn: null,
              followUpAt: remindAt,
            });
            setTitle("");
            setDueAt(null);
            setRemindAt(null);
            window.dispatchEvent(new Event("desk-changed"));
          });
        }}
      >
        <div className="todo-compose-main">
          <input
            value={title}
            placeholder="写一条待办"
            onChange={(event) => setTitle(event.target.value)}
            aria-label="待办标题"
          />
          <button className="primary" type="submit" disabled={!title.trim()}>添加</button>
        </div>
        <div className="todo-compose-affil">
          <div className="todo-compose-meta">
            <TodoScheduleBar
              dueAt={dueAt}
              remindAt={remindAt}
              onDueChange={setDueAt}
              onRemindChange={setRemindAt}
            />
            <button
              type="button"
              className="todo-affil-toggle"
              aria-expanded={showAffil}
              onClick={() => setShowAffil((open) => !open)}
            >
              挂靠：{affilSummary}
            </button>
          </div>
          {showAffil && (
            <div className="todo-affil-fields">
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSubId("");
                }}
                aria-label="挂靠项目"
              >
                <option value="">不挂项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select
                value={subId}
                onChange={(event) => setSubId(event.target.value)}
                disabled={!projectId}
                aria-label="挂靠子任务"
              >
                <option value="">{projectId ? "整个项目" : "先选项目"}</option>
                {projectSubs.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </form>
      {todos.length === 0 && <Empty text="还没有待办。写一条，勾选就完事。" />}
      <div className="list">
        {todos.map((item) => {
          const done = item.status === "done";
          const affil = affiliationLabel(item);
          const loose = !done && item.projectId == null && item.subprojectId == null;
          return (
            <article className={done ? "row todo-row done" : "row todo-row"} key={item.id}>
              <div className="todo-check">
                <input
                  type="checkbox"
                  checked={done}
                  aria-label={`完成 ${item.title}`}
                  onChange={(event) => void run(() => api.setTodoDone(item.id, event.target.checked))}
                />
                <div className="todo-body">
                  <button type="button" className="todo-title todo-title-open" onClick={() => openTodo(item)}>
                    {item.title}
                  </button>
                  {(item.dueAt || item.followUpAt || affil) && (
                    <span className="meta todo-meta">
                      {item.dueAt && <span>截止 {when(item.dueAt)}</span>}
                      {item.followUpAt && <span>提醒 {when(item.followUpAt)}</span>}
                      {affil && item.projectId != null ? (
                        <button
                          type="button"
                          className="todo-affil-link"
                          onClick={() => onOpen(item.projectId as number)}
                        >
                          {affil}
                        </button>
                      ) : affil ? (
                        <span>{affil}</span>
                      ) : null}
                    </span>
                  )}
                </div>
              </div>
              <div className="actions">
                {loose && (
                  <button type="button" className="quiet todo-link-btn" disabled={busyId != null} onClick={() => { setError(""); setLinkTarget(item); }}>
                    关联
                  </button>
                )}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => void run(async () => {
                    await api.dropItem(item.id);
                    window.dispatchEvent(new Event("desk-changed"));
                  })}
                >
                  丢掉
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {busyId != null && <AiBusy label="正在辅助关联这条待办" />}

      {linkTarget && (
        <Dialog title="关联" onClose={closeLink}>
          <p className="note">「{linkTarget.title}」还没挂项目。选手动填写，或让助手先预填。</p>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="primary" onClick={() => startManual(linkTarget)}>手动</button>
            <button type="button" disabled={busyId != null} onClick={() => void startAi(linkTarget)}>AI 辅助</button>
            <button type="button" className="quiet" onClick={closeLink}>取消</button>
          </div>
        </Dialog>
      )}

      {draft && (
        <Dialog title="关联到项目" onClose={closeLink}>
          <div className="stack">
            <p className="note">{note}</p>
            <AiThinking text={thinking} />
            <Field label="标题"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="整理为">
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="todo">仍为待办（挂靠）</option>
                <option value="task">项目任务</option>
                <option value="waiting">阻塞项</option>
              </select>
            </Field>
            <Field label="选择项目">
              <select
                value={draft.projectId ?? ""}
                onChange={(event) => setDraft({
                  ...draft,
                  projectId: event.target.value ? Number(event.target.value) : null,
                  subprojectId: null,
                })}
              >
                <option value="" disabled>选择大项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </Field>
            {kind === "todo" && (
              <Field label="子任务，可空">
                <select
                  value={draft.subprojectId ?? ""}
                  disabled={!draft.projectId}
                  onChange={(event) => setDraft({
                    ...draft,
                    subprojectId: event.target.value ? Number(event.target.value) : null,
                  })}
                >
                  <option value="">整个项目</option>
                  {draftSubs.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {kind === "task" && (
              <>
                <Field label="四象限">
                  <select
                    value={quadrantValue(draft.important, draft.urgent)}
                    onChange={(event) => {
                      const next = parseQuadrant(event.target.value);
                      setDraft({
                        ...draft,
                        important: next?.important ?? null,
                        urgent: next?.urgent ?? null,
                      });
                    }}
                  >
                    <option value="" disabled>选择四象限</option>
                    {QUADRANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <DateTimeField label="截止时间，可空" value={draft.dueAt ?? ""} emptyText="未设置，点这里选择" onChange={(value) => setDraft({ ...draft, dueAt: value || null })} />
              </>
            )}
            {kind === "waiting" && (
              <>
                <Field label="在等什么"><input value={draft.waitingOn ?? ""} onChange={(event) => setDraft({ ...draft, waitingOn: event.target.value })} /></Field>
                <DateTimeField label="何时再问" value={draft.followUpAt ?? ""} emptyText="未设置，点这里选择" onChange={(followUpAt) => setDraft({ ...draft, followUpAt: followUpAt || null })} />
              </>
            )}
            <Field label="备注"><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={closeLink}>取消</button>
              <button type="button" className="primary" onClick={() => void saveLink()}>保存</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
