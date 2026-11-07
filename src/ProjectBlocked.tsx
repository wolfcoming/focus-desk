import { useEffect, useState, type FormEvent } from "react";
import { api, message } from "./api";
import type { Item } from "./types";
import { AiBusy, AiThinking, DateTimeField, Dialog, Empty, ErrorText, Field, toLocalInput, when } from "./widgets";

const emptyForm = { title: "", waitingOn: "", followUpAt: "" };

export function ProjectBlocked({
  projectId,
  revision,
}: {
  projectId: number;
  revision: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editWaitingOn, setEditWaitingOn] = useState("");
  const [editFollowUp, setEditFollowUp] = useState("");
  const [scriptItem, setScriptItem] = useState<Item | null>(null);
  const [scriptExtra, setScriptExtra] = useState("");
  const [scripts, setScripts] = useState<string[]>([]);
  const [scriptThinking, setScriptThinking] = useState<string | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function load() {
    const waiting = await api.listItems("waiting");
    setItems(waiting.filter((item) => item.status === "open" && item.projectId === projectId));
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision, projectId]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
      window.dispatchEvent(new Event("desk-changed"));
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.saveItem({
        kind: "waiting",
        title: form.title,
        notes: "",
        projectId,
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
        waitingOn: form.waitingOn,
        followUpAt: form.followUpAt,
      });
      window.dispatchEvent(new Event("desk-changed"));
      setOpen(false);
      setForm(emptyForm);
      await load();
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function generateScripts() {
    if (!scriptItem || scriptBusy) return;
    setScriptBusy(true);
    setCopied(null);
    try {
      const result = await api.followUpLines(scriptItem.id, scriptExtra.trim() || null);
      setScripts(result.scripts);
      setScriptThinking(result.thinking);
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setScriptBusy(false);
    }
  }

  async function copyScript(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <section className="project-section">
      <div className="section-head">
        <h2>阻塞项</h2>
        <span className="section-count">{items.length}</span>
      </div>
      <ErrorText text={!open && !editItem && !scriptItem ? error : ""} />
      {items.length === 0 ? (
        <Empty text="还没有阻塞项。" />
      ) : (
        <div className="list">
          {items.map((item) => (
            <article className="row" key={item.id}>
              <div>
                <h3>
                  <button
                    type="button"
                    className="title-button"
                    onClick={() => {
                      setError("");
                      setEditItem(item);
                      setEditTitle(item.title);
                      setEditWaitingOn(item.waitingOn ?? "");
                      setEditFollowUp(toLocalInput(item.followUpAt));
                    }}
                  >
                    {item.title}
                  </button>
                </h3>
                <div className="meta">在等 {item.waitingOn} · {when(item.followUpAt)}</div>
              </div>
              <div className="actions row-tools">
                <button type="button" className="action-link" onClick={() => void run(() => api.bumpFollowUp(item.id, 1))}>明天再问</button>
                <button
                  type="button"
                  className="action-link"
                  onClick={() => {
                    setError("");
                    setScriptItem(item);
                    setScriptExtra("");
                    setScripts([]);
                    setScriptThinking(null);
                    setCopied(null);
                  }}
                >
                  话术
                </button>
                <button type="button" className="action-end" onClick={() => void run(() => api.completeItem(item.id))}>结束</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <button
        type="button"
        className="add-inline"
        onClick={() => {
          setForm(emptyForm);
          setError("");
          setOpen(true);
        }}
      >
        + 新建阻塞项
      </button>

      {open && (
        <Dialog title="新建阻塞项" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(event) => void create(event)}>
            <Field label="标题"><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
            <Field label="在等什么"><input value={form.waitingOn} onChange={(event) => setForm({ ...form, waitingOn: event.target.value })} /></Field>
            <DateTimeField label="何时再问" value={form.followUpAt} emptyText="未设置，点这里选择" onChange={(followUpAt) => setForm({ ...form, followUpAt })} />
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setOpen(false)}>取消</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? "正在记下…" : "记下"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {scriptItem && (
        <Dialog title="问询话术" onClose={() => setScriptItem(null)}>
          <div className="stack">
            <p className="note">「{scriptItem.title}」在等 {scriptItem.waitingOn || "回复"}。补充说明可以留空。</p>
            <Field label="补充描述，可空">
              <textarea
                rows={3}
                value={scriptExtra}
                placeholder="例如对方上次说还在确认预算"
                onChange={(event) => setScriptExtra(event.target.value)}
              />
            </Field>
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setScriptItem(null)}>关闭</button>
              <button type="button" className="primary" disabled={scriptBusy} onClick={() => void generateScripts()}>
                {scriptBusy ? "正在生成…" : "生成"}
              </button>
            </div>
            {scriptBusy && <AiBusy label="正在写问询话术" />}
            <ErrorText text={error} />
            <AiThinking text={scriptThinking} />
            {scripts.length > 0 && (
              <div className="script-list">
                {scripts.map((script, index) => (
                  <div className="script-row" key={script}>
                    <p>{script}</p>
                    <button type="button" onClick={() => void copyScript(script, index)}>
                      {copied === index ? "已复制" : "复制"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {editItem && (
        <Dialog title="修改阻塞项" onClose={() => setEditItem(null)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const target = editItem;
              void run(async () => {
                await api.saveItem({
                  id: target.id,
                  kind: "waiting",
                  title: editTitle.trim(),
                  notes: target.notes,
                  projectId,
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
                  waitingOn: editWaitingOn,
                  followUpAt: editFollowUp,
                });
                setEditItem(null);
              });
            }}
          >
            <Field label="标题">
              <input autoFocus value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
            </Field>
            <Field label="在等什么">
              <input value={editWaitingOn} onChange={(event) => setEditWaitingOn(event.target.value)} />
            </Field>
            <DateTimeField label="何时再问" value={editFollowUp} emptyText="未设置，点这里选择" onChange={setEditFollowUp} />
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setEditItem(null)}>取消</button>
              <button className="primary" type="submit" disabled={busy || !editFollowUp || !editTitle.trim() || !editWaitingOn.trim()}>
                {busy ? "正在保存…" : "保存"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
