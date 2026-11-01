import { useEffect, useState, type FormEvent } from "react";
import { api, message } from "./api";
import type { Limits, Project, Subproject, WorkLog } from "./types";
import { parseQuadrant, projectStatus, QUADRANT_OPTIONS, subStatus } from "./types";
import { DateTimeField, DayChecks, Dialog, Empty, ErrorText, Field, when } from "./widgets";

const emptyProjectForm = { name: "", outcome: "", status: "active" };
const emptySubForm = {
  kind: "regular",
  name: "",
  quadrant: "iu",
  progress: "doing",
  dueAt: "",
  repeatDays: "1,2,3,4,5",
  remind: false,
  remindAt: "09:00",
  progressPercent: "",
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
    return `周期性 · ${repeatLabel(sub.repeatDays)} · ${sub.remindAt ? `${sub.remindAt} 提醒` : "不定时提醒"}`;
  }
  const progress = progressLabel[sub.progress] ?? subStatus[sub.status];
  const percent = sub.progress === "doing" && sub.progressPercent != null ? ` ${sub.progressPercent}%` : "";
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
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [capWarning, setCapWarning] = useState("");

  useEffect(() => {
    if (!createOpen) return;
    setForm(emptyProjectForm);
    setError("");
    void api.limits().then(setLimits).catch((reason) => setError(message(reason)));
  }, [createOpen]);

  useEffect(() => {
    if (deleteTarget) setError("");
  }, [deleteTarget]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const over = form.status === "active" && (limits?.activeProjects ?? 0) >= (limits?.projectCap ?? 3);
      const created = await api.createProject({
        name: form.name,
        outcome: form.outcome,
        status: form.status,
        pauseProjectId: null,
      });
      window.dispatchEvent(new Event("desk-changed"));
      if (over) setCapWarning("进行中的大项目已经超过 3 个。这次已经建立，只是提醒你。");
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
            <Field label="状态">
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">进行中</option>
                <option value="upcoming">即将开始</option>
                <option value="paused">暂停</option>
              </select>
            </Field>
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={onCloseCreate}>取消</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? "正在建立…" : "建立"}</button>
            </div>
          </form>
        </Dialog>
      )}
      {capWarning && (
        <Dialog title="数量提醒" onClose={() => setCapWarning("")}>
          <p>{capWarning}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => setCapWarning("")}>知道了</button>
          </div>
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
  onAskDelete,
  onSelectProject,
}: {
  revision: number;
  selectedId: number | null;
  projectTick: number;
  onAskDelete: (project: Project) => void;
  onSelectProject: (id: number | null) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [capWarning, setCapWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [createSub, setCreateSub] = useState(false);
  const [openSubId, setOpenSubId] = useState<number | null>(null);
  const [progressForm, setProgressForm] = useState({ progress: "doing", progressPercent: "", log: "" });
  const [deleteSub, setDeleteSub] = useState<Subproject | null>(null);
  const [subForm, setSubForm] = useState(emptySubForm);

  async function load() {
    const [nextProjects, nextSubs, nextLimits, nextLogs] = await Promise.all([
      api.listProjects(),
      api.listSubprojects(null),
      api.limits(),
      api.listWorkLogs(selectedId),
    ]);
    setProjects(nextProjects);
    setSubs(nextSubs);
    setLimits(nextLimits);
    setLogs(nextLogs);
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision, selectedId]);

  useEffect(() => {
    setOpenSubId(null);
  }, [selectedId, projectTick]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
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
  const activeProjects = projects.filter((project) => project.status === "active");
  const activeSubs = subs.filter((sub) => sub.status === "active");

  function openCreate() {
    setSubForm(emptySubForm);
    setError("");
    setCreateSub(true);
  }

  function openSub(sub: Subproject) {
    setError("");
    setOpenSubId(sub.id);
    setProgressForm({
      progress: progressOf(sub),
      progressPercent: sub.progressPercent == null ? "" : String(sub.progressPercent),
      log: "",
    });
  }

  const mine = current ? subs.filter((sub) => sub.projectId === current.id) : [];
  const opened = mine.find((sub) => sub.id === openSubId) ?? null;
  const projectLogs = current ? logs.filter((log) => mine.some((sub) => sub.id === log.subprojectId)) : [];
  const regularMine = mine.filter((sub) => sub.kind !== "periodic");
  const doingCount = regularMine.filter((sub) => progressOf(sub) === "doing").length;
  const doneCount = regularMine.filter((sub) => progressOf(sub) === "done").length;

  return (
    <section>
      {!current && (
        <>
          <h1>项目</h1>
          <p className="lead">点开一条，查看它的子任务和全部工作记录。</p>
          {projects.filter((project) => project.status !== "archived").length === 0 && !error && <Empty text="还没有大项目。在左侧新建一条。" />}
          <div className="list">
            {projects.filter((project) => project.status !== "archived").map((project) => {
              const count = subs.filter((sub) => sub.projectId === project.id).length;
              return (
                <article className="row" key={project.id}>
                  <button type="button" className="row-open" onClick={() => onSelectProject(project.id)}>
                    <h3>{project.name}</h3>
                    <div className="meta">{project.outcome || "还没有写描述。"} · {projectStatus[project.status] ?? project.status} · {count} 个子任务</div>
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
      {current && !opened && (
        <>
          <button type="button" className="back" onClick={() => onSelectProject(null)}>返回项目列表</button>
          <h1>{current.name}</h1>
          <p className="lead">{current.outcome || "还没有写描述。"} · {projectStatus[current.status] ?? current.status}</p>
          <div className="facts">
            <span>建立于 {when(current.createdAt)}</span>
            <span>子任务 {mine.length}</span>
            <span>进行中 {doingCount}</span>
            <span>已完成 {doneCount}</span>
          </div>
          <div className="actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
            {current.status !== "active" && <button type="button" onClick={() => {
              const over = (limits?.activeProjects ?? 0) >= (limits?.projectCap ?? 3);
              void run(async () => {
                await api.setProjectStatus(current.id, "active", null);
                if (over) setCapWarning("进行中的大项目已经超过 3 个。已经恢复，只是提醒你。");
              });
            }}>恢复进行</button>}
            {current.status === "active" && <button type="button" onClick={() => void run(() => api.setProjectStatus(current.id, "paused", null))}>暂停这条线</button>}
            <button type="button" className="quiet tree-delete" onClick={() => onAskDelete(current)}>删除</button>
          </div>
          <ErrorText text={error} />
          {notice && <p className="note">{notice}</p>}
          <h2>子任务</h2>
          {mine.length === 0 && <Empty text="还没有子任务。" />}
          <div className="list">
            {mine.map((sub) => (
              <article className="row" key={sub.id}>
                <button type="button" className="row-open" onClick={() => openSub(sub)}>
                  <h3>{sub.name}</h3>
                  <div className="meta">{subMeta(sub)}</div>
                </button>
                <div className="actions">
                  <button type="button" className="quiet tree-delete" onClick={() => { setError(""); setDeleteSub(sub); }}>删除</button>
                </div>
              </article>
            ))}
            <button type="button" className="add-row" onClick={openCreate}>新建子任务</button>
          </div>
          <h2>工作记录</h2>
          {projectLogs.length === 0 && <Empty text="还没有工作记录。改进度时可以写一条。" />}
          <ul className="log-history">
            {projectLogs.map((log) => (
              <li key={log.id}>
                <span>{mine.find((sub) => sub.id === log.subprojectId)?.name ?? "子任务"} · {logStamp(log)}</span>
                {log.body}
              </li>
            ))}
          </ul>
        </>
      )}
      {current && opened && (
        <>
          <button type="button" className="back" onClick={() => setOpenSubId(null)}>返回 {current.name}</button>
          <h1>{opened.name}</h1>
          <p className="lead">{subMeta(opened)}</p>
          <div className="facts">
            <span>上次触碰 {when(opened.lastTouchedAt)}</span>
            {opened.nextTitle && <span>下一步 {opened.nextTitle}</span>}
          </div>
          <div className="actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
            {opened.status !== "active" && opened.kind !== "periodic" && <button type="button" onClick={() => {
              const over = activeSubs.length >= (limits?.subprojectCap ?? 5);
              void run(async () => {
                await api.setSubprojectStatus(opened.id, "active", null);
                if (over) setCapWarning("进行中的子任务已经超过 5 个。已经恢复，只是提醒你。");
              });
            }}>恢复</button>}
            {opened.status === "active" && <button type="button" onClick={() => void run(() => api.setSubprojectStatus(opened.id, "paused", null))}>暂停</button>}
            <button type="button" className="quiet tree-delete" onClick={() => { setError(""); setDeleteSub(opened); }}>删除</button>
          </div>
          <ErrorText text={error} />
          {notice && <p className="note">{notice}</p>}
          {opened.kind !== "periodic" && (
            <div className="stack detail-form">
              <h2>截止时间</h2>
              <DateTimeField
                label="截止时间，可空"
                value={opened.dueAt ?? ""}
                emptyText="未设置，点这里选择"
                onChange={(dueAt) => {
                  const target = opened;
                  void run(async () => {
                    await api.setSubprojectDue(target.id, dueAt || null);
                    setNotice(dueAt ? `已更新「${target.name}」的截止时间` : `已清除「${target.name}」的截止时间`);
                  });
                }}
              />
            </div>
          )}
          {opened.kind !== "periodic" && (
            <form className="stack detail-form" onSubmit={(event) => {
              event.preventDefault();
              const target = opened;
              const becomesActive = progressForm.progress === "doing" && target.status !== "active";
              const subOver = becomesActive && activeSubs.length >= (limits?.subprojectCap ?? 5);
              const projectOver = progressForm.progress === "doing" && current.status !== "active" && activeProjects.length >= (limits?.projectCap ?? 3);
              void run(async () => {
                let progressPercent: number | null = null;
                if (progressForm.progress === "doing" && progressForm.progressPercent.trim() !== "") {
                  const raw = progressForm.progressPercent.trim();
                  if (!/^\d+$/.test(raw) || Number(raw) > 100) throw new Error("进行中的进度要在 0 到 100 之间");
                  progressPercent = Number(raw);
                }
                await api.setSubprojectProgress(target.id, progressForm.progress, progressPercent, progressForm.log.trim() || null);
                setProgressForm({
                  progress: progressForm.progress,
                  progressPercent: progressForm.progress === "doing" && progressPercent != null ? String(progressPercent) : "",
                  log: "",
                });
                setNotice(`已更新「${target.name}」的进度`);
                if (projectOver && subOver) setCapWarning("进行中的大项目已经超过 3 个，子任务也超过 5 个。已经更新，只是提醒你。");
                else if (projectOver) setCapWarning("进行中的大项目已经超过 3 个。已经更新，只是提醒你。");
                else if (subOver) setCapWarning("进行中的子任务已经超过 5 个。已经更新，只是提醒你。");
              });
            }}>
              <h2>更新进度</h2>
              <Field label="进度">
                <select value={progressForm.progress} onChange={(event) => setProgressForm({ ...progressForm, progress: event.target.value })}>
                  <option value="not_started">未开始</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </Field>
              {progressForm.progress === "doing" && (
                <Field label="进行中进度">
                  <span className="with-unit">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      placeholder="0–100"
                      value={progressForm.progressPercent}
                      onChange={(event) => setProgressForm({ ...progressForm, progressPercent: event.target.value })}
                    />
                    <span className="unit">%</span>
                  </span>
                </Field>
              )}
              <Field label="工作日志">
                <textarea
                  rows={3}
                  placeholder="这次做了什么。可以留空。"
                  value={progressForm.log}
                  onChange={(event) => setProgressForm({ ...progressForm, log: event.target.value })}
                />
              </Field>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存"}</button>
              </div>
            </form>
          )}
          <h2>工作日志</h2>
          {logs.filter((log) => log.subprojectId === opened.id).length === 0 && <Empty text="还没有工作日志。" />}
          <ul className="log-history">
            {logs.filter((log) => log.subprojectId === opened.id).map((log) => (
              <li key={log.id}>
                <span>{logStamp(log)}</span>
                {log.body}
              </li>
            ))}
          </ul>
        </>
      )}
      {createSub && current && (
        <Dialog title="新建子任务" onClose={() => setCreateSub(false)}>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const name = subForm.name.trim();
            const becomesActive = subForm.kind === "periodic" || subForm.progress === "doing";
            const subOver = becomesActive && activeSubs.length >= (limits?.subprojectCap ?? 5);
            const projectOver = subForm.kind === "regular" && subForm.progress === "doing" && current.status !== "active" && activeProjects.length >= (limits?.projectCap ?? 3);
            void run(async () => {
              let progressPercent: number | null = null;
              if (subForm.kind === "regular" && subForm.progress === "doing" && subForm.progressPercent.trim() !== "") {
                const raw = subForm.progressPercent.trim();
                if (!/^\d+$/.test(raw) || Number(raw) > 100) throw new Error("进行中的进度要在 0 到 100 之间");
                progressPercent = Number(raw);
              }
              const quadrant = parseQuadrant(subForm.quadrant);
              await api.createSubproject({
                projectId: current.id,
                kind: subForm.kind,
                name: subForm.name,
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
              setNotice(`已建立「${name}」`);
              if (projectOver && subOver) setCapWarning("进行中的大项目已经超过 3 个，子任务也超过 5 个。这次已经建立，只是提醒你。");
              else if (projectOver) setCapWarning("进行中的大项目已经超过 3 个。这次已经建立，只是提醒你。");
              else if (subOver) setCapWarning("进行中的子任务已经超过 5 个。这次已经建立，只是提醒你。");
            });
          }}>
            <div className="choice" role="group" aria-label="子任务类型">
              <button type="button" aria-pressed={subForm.kind === "regular"} onClick={() => setSubForm({ ...subForm, kind: "regular" })}>常规任务</button>
              <button type="button" aria-pressed={subForm.kind === "periodic"} onClick={() => setSubForm({ ...subForm, kind: "periodic" })}>周期性任务</button>
            </div>
            {subForm.kind === "regular" ? (
              <>
                <Field label="名称"><input autoFocus value={subForm.name} onChange={(event) => setSubForm({ ...subForm, name: event.target.value })} /></Field>
                <Field label="四象限">
                  <select value={subForm.quadrant} onChange={(event) => setSubForm({ ...subForm, quadrant: event.target.value })}>
                    {QUADRANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="进度">
                  <select value={subForm.progress} onChange={(event) => setSubForm({ ...subForm, progress: event.target.value })}>
                    <option value="not_started">未开始</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </Field>
                {subForm.progress === "doing" && (
                  <Field label="进行中进度">
                    <span className="with-unit">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        placeholder="0–100"
                        value={subForm.progressPercent}
                        onChange={(event) => setSubForm({ ...subForm, progressPercent: event.target.value })}
                      />
                      <span className="unit">%</span>
                    </span>
                  </Field>
                )}
                <DateTimeField label="截止时间，可空" value={subForm.dueAt} emptyText="未设置，点这里选择" onChange={(dueAt) => setSubForm({ ...subForm, dueAt })} />
              </>
            ) : (
              <>
                <Field label="标题"><input autoFocus value={subForm.name} onChange={(event) => setSubForm({ ...subForm, name: event.target.value })} /></Field>
                <Field label="重复日期"><DayChecks value={subForm.repeatDays} onChange={(repeatDays) => setSubForm({ ...subForm, repeatDays })} /></Field>
                <label className="check-line">
                  <span>定时提醒</span>
                  <input type="checkbox" checked={subForm.remind} onChange={(event) => setSubForm({ ...subForm, remind: event.target.checked })} />
                </label>
                {subForm.remind && (
                  <Field label="提醒时间"><input type="time" value={subForm.remindAt} onChange={(event) => setSubForm({ ...subForm, remindAt: event.target.value })} /></Field>
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
      {capWarning && (
        <Dialog title="数量提醒" onClose={() => setCapWarning("")}>
          <p>{capWarning}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => setCapWarning("")}>知道了</button>
          </div>
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
