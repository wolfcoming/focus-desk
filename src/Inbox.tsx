import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { Item, ItemDraft, Project, Subproject } from "./types";
import { DateTimeField, Empty, ErrorText, Field } from "./widgets";

const emptyDraft = (title = ""): ItemDraft => ({
  kind: "task",
  title,
  notes: "",
  projectId: null,
  subprojectId: null,
  important: null,
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

function asInboxKind(kind: string) {
  return kind === "waiting" ? "waiting" : "task";
}

export function Inbox({ revision }: { revision: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [inbox, projectList, subprojects] = await Promise.all([
      api.listItems("inbox"),
      api.listProjects(),
      api.listSubprojects(null),
    ]);
    setItems(inbox.filter((item) => item.status === "inbox"));
    setProjects(projectList.filter((project) => project.status !== "archived"));
    setSubs(subprojects.filter((sub) => sub.status !== "archived"));
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision]);

  async function clarify(id: number) {
    try {
      const result = await api.clarify(id);
      const kind = asInboxKind(result.draft.kind);
      setDraft({
        ...result.draft,
        kind,
        projectId: kind === "task" ? result.draft.projectId : null,
        subprojectId: kind === "waiting" ? result.draft.subprojectId : null,
        estimateMin: null,
        waitingOn: kind === "waiting" ? result.draft.waitingOn : null,
        followUpAt: kind === "waiting" ? result.draft.followUpAt : null,
      });
      setNote(result.note);
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  function setKind(kind: string) {
    if (!draft) return;
    const next = asInboxKind(kind);
    setDraft({
      ...draft,
      kind: next,
      projectId: next === "task" ? draft.projectId : null,
      subprojectId: next === "waiting" ? draft.subprojectId : null,
      estimateMin: null,
      important: next === "task" ? draft.important : null,
      dueAt: next === "task" ? draft.dueAt : null,
      waitingOn: next === "waiting" ? draft.waitingOn : null,
      followUpAt: next === "waiting" ? draft.followUpAt : null,
    });
  }

  async function save() {
    if (!draft) return;
    const kind = asInboxKind(draft.kind);
    try {
      await api.saveItem({
        ...draft,
        kind,
        projectId: kind === "task" ? draft.projectId : null,
        subprojectId: kind === "waiting" ? draft.subprojectId : null,
        estimateMin: null,
      });
      setDraft(null);
      setNote("");
      window.dispatchEvent(new Event("desk-changed"));
      await load();
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  const kind = draft ? asInboxKind(draft.kind) : "task";

  return (
    <section>
      <h1>收集箱</h1>
      <p className="lead">先收一句话。整理的时候再决定它是项目任务，还是等待跟进。</p>
      <ErrorText text={error} />
      {items.length === 0 && <Empty text="收集箱是空的。" />}
      <div className="list">
        {items.map((item) => (
          <article className="row" key={item.id}>
            <h3>{item.title}</h3>
            <div className="actions">
              <button onClick={() => void clarify(item.id)}>整理</button>
              <button className="quiet" onClick={() => void api.dropItem(item.id).then(load).catch((reason) => setError(message(reason)))}>丢掉</button>
            </div>
          </article>
        ))}
      </div>
      {draft && (
        <div className="panel stack">
          <p className="note">{note}</p>
          <Field label="标题"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label="类型">
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="task">项目任务</option>
              <option value="waiting">等待跟进</option>
            </select>
          </Field>
          {kind === "task" ? (
            <Field label="选择项目">
              <select
                value={draft.projectId ?? ""}
                onChange={(event) => setDraft({ ...draft, projectId: Number(event.target.value), subprojectId: null })}
              >
                <option value="" disabled>选择大项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="子任务">
              <select
                value={draft.subprojectId ?? ""}
                onChange={(event) => {
                  const subprojectId = Number(event.target.value);
                  const sub = subs.find((item) => item.id === subprojectId);
                  setDraft({ ...draft, subprojectId, projectId: sub?.projectId ?? null });
                }}
              >
                <option value="" disabled>选择子任务</option>
                {subs.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.projectName} / {sub.name}</option>
                ))}
              </select>
            </Field>
          )}
          {kind === "task" && (
            <>
              <Field label="重不重要">
                <select
                  value={draft.important === null ? "" : draft.important ? "yes" : "no"}
                  onChange={(event) => setDraft({ ...draft, important: event.target.value === "yes" })}
                >
                  <option value="" disabled>选择</option>
                  <option value="yes">重要</option>
                  <option value="no">不重要</option>
                </select>
              </Field>
              <DateTimeField label="截止，可空" value={draft.dueAt ?? ""} emptyText="未设置，点这里选择" onChange={(dueAt) => setDraft({ ...draft, dueAt: dueAt || null })} />
            </>
          )}
          {kind === "waiting" && (
            <>
              <Field label="在等什么"><input value={draft.waitingOn ?? ""} onChange={(event) => setDraft({ ...draft, waitingOn: event.target.value })} /></Field>
              <DateTimeField label="何时再问" value={draft.followUpAt ?? ""} emptyText="未设置，点这里选择" onChange={(followUpAt) => setDraft({ ...draft, followUpAt: followUpAt || null })} />
            </>
          )}
          <Field label="备注"><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button className="primary" onClick={() => void save()}>保存</button>
            <button className="quiet" onClick={() => setDraft(null)}>取消</button>
          </div>
        </div>
      )}
      <button className="quiet" onClick={() => { setDraft(emptyDraft()); setNote("手填一条，不经过收集箱。"); }}>直接新建</button>
    </section>
  );
}
