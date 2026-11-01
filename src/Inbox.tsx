import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { Item, ItemDraft, Project } from "./types";
import { parseQuadrant, quadrantValue, QUADRANT_OPTIONS } from "./types";
import { AiBusy, AiThinking, DateTimeField, Empty, ErrorText, Field } from "./widgets";

const emptyDraft = (title = ""): ItemDraft => ({
  kind: "task",
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

function asInboxKind(kind: string) {
  return kind === "waiting" ? "waiting" : "task";
}

export function Inbox({ revision }: { revision: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [note, setNote] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [inbox, projectList] = await Promise.all([
      api.listItems("inbox"),
      api.listProjects(),
    ]);
    setItems(inbox.filter((item) => item.status === "inbox"));
    setProjects(projectList.filter((project) => project.status !== "archived"));
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision]);

  function organizeManually(item: Item) {
    setThinking(null);
    setError("");
    setDraft({
      ...emptyDraft(item.title),
      id: item.id,
      notes: item.notes,
    });
    setNote("手填这条临时任务。");
  }

  async function clarify(id: number) {
    if (busyId != null) return;
    setBusyId(id);
    setThinking(null);
    setError("");
    try {
      const result = await api.clarify(id);
      const kind = asInboxKind(result.draft.kind);
      setDraft({
        ...result.draft,
        kind,
        projectId: result.draft.projectId,
        subprojectId: null,
        estimateMin: null,
        waitingOn: kind === "waiting" ? result.draft.waitingOn : null,
        followUpAt: kind === "waiting" ? result.draft.followUpAt : null,
      });
      setNote(result.note);
      setThinking(result.thinking ?? null);
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusyId(null);
    }
  }

  function setKind(kind: string) {
    if (!draft) return;
    const next = asInboxKind(kind);
    setDraft({
      ...draft,
      kind: next,
      projectId: draft.projectId,
      subprojectId: null,
      estimateMin: null,
      important: next === "task" ? draft.important : null,
      urgent: next === "task" ? draft.urgent : null,
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
        projectId: draft.projectId,
        subprojectId: null,
        estimateMin: null,
      });
      setDraft(null);
      setNote("");
      setThinking(null);
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
      <h1>临时任务</h1>
      <p className="lead">先收一句话。整理时再决定它是项目任务，还是等待跟进。</p>
      <ErrorText text={error} />
      {items.length === 0 && <Empty text="还没有临时任务。" />}
      <div className="list">
        {items.map((item) => (
          <article className="row" key={item.id}>
            <h3>{item.title}</h3>
            <div className="actions">
              <button disabled={busyId != null} onClick={() => organizeManually(item)}>手动整理</button>
              <button disabled={busyId != null} onClick={() => void clarify(item.id)}>
                {busyId === item.id ? "整理中…" : "AI辅助整理"}
              </button>
              <button className="quiet" disabled={busyId != null} onClick={() => void api.dropItem(item.id).then(load).catch((reason) => setError(message(reason)))}>丢掉</button>
            </div>
          </article>
        ))}
      </div>
      {busyId != null && <AiBusy label="正在辅助整理这条临时任务" />}
      {draft && (
        <div className="panel stack">
          <p className="note">{note}</p>
          <AiThinking text={thinking} />
          <Field label="标题"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label="类型">
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="task">项目任务</option>
              <option value="waiting">等待跟进</option>
            </select>
          </Field>
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
              <DateTimeField label="截止时间，可空" value={draft.dueAt ?? ""} emptyText="未设置，点这里选择" onChange={(dueAt) => setDraft({ ...draft, dueAt: dueAt || null })} />
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
            <button className="quiet" onClick={() => { setDraft(null); setThinking(null); }}>取消</button>
          </div>
        </div>
      )}
      <button className="quiet" onClick={() => { setDraft(emptyDraft()); setNote("手填一条，不经过临时任务。"); setThinking(null); }}>直接新建</button>
    </section>
  );
}
