import { useEffect, useState, type FormEvent } from "react";
import { api, message } from "./api";
import type { Item, Subproject } from "./types";
import { DateTimeField, Dialog, Empty, ErrorText, Field, toLocalInput, when } from "./widgets";

const emptyForm = { title: "", subprojectId: "", waitingOn: "", followUpAt: "" };

export function Waiting({ revision }: { revision: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editFollowUp, setEditFollowUp] = useState("");

  async function load() {
    const [waiting, subprojects] = await Promise.all([api.listItems("waiting"), api.listSubprojects(null)]);
    setItems(waiting.filter((item) => item.status === "open"));
    setSubs(subprojects.filter((sub) => sub.status !== "archived"));
  }

  useEffect(() => {
    void load().catch((reason) => setError(message(reason)));
  }, [revision]);

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setOpen(true);
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
        projectId: null,
        subprojectId: form.subprojectId ? Number(form.subprojectId) : null,
        important: null,
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

  return (
    <section>
      <h1>等待</h1>
      <p className="lead">卡在别人或外部条件上的事，到了询问时间会提醒你跟进。</p>
      <ErrorText text={!open && !editItem ? error : ""} />
      {items.length === 0 && <Empty text="还没有等待中的事。" />}
      <div className="list">
        {items.map((item) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">在等 {item.waitingOn} · {item.subprojectName} · {when(item.followUpAt)}</div>
            </div>
            <div className="actions">
              <button type="button" onClick={() => {
                setError("");
                setEditItem(item);
                setEditFollowUp(toLocalInput(item.followUpAt));
              }}>改时间</button>
              <button type="button" onClick={() => void run(() => api.bumpFollowUp(item.id, 1))}>明天再问</button>
              <button type="button" onClick={() => void run(() => api.completeItem(item.id))}>结束</button>
              <button type="button" className="quiet" onClick={() => void run(() => api.dropItem(item.id))}>放弃</button>
            </div>
          </article>
        ))}
        <button type="button" className="add-row" onClick={openCreate}>新建等待</button>
      </div>
      {open && (
        <Dialog title="新建等待" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(event) => void create(event)}>
            <Field label="标题"><input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
            <Field label="子任务">
              <select value={form.subprojectId} onChange={(event) => setForm({ ...form, subprojectId: event.target.value })}>
                <option value="">选择</option>
                {subs.map((sub) => <option key={sub.id} value={sub.id}>{sub.projectName} / {sub.name}</option>)}
              </select>
            </Field>
            {subs.length === 0 && <p className="note">先在左侧项目里建立一条子任务，等待要挂在它上面。</p>}
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
      {editItem && (
        <Dialog title="调整询问时间" onClose={() => setEditItem(null)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const target = editItem;
              void run(async () => {
                await api.saveItem({
                  id: target.id,
                  kind: "waiting",
                  title: target.title,
                  notes: target.notes,
                  projectId: target.projectId,
                  subprojectId: target.subprojectId,
                  important: null,
                  dueAt: null,
                  estimateMin: null,
                  repeatDays: null,
                  windowStart: null,
                  windowEnd: null,
                  graceMin: null,
                  interruptAfterGrace: false,
                  waitingOn: target.waitingOn,
                  followUpAt: editFollowUp,
                });
                setEditItem(null);
              });
            }}
          >
            <p className="note">「{editItem.title}」现在问询时间是 {when(editItem.followUpAt)}。</p>
            <DateTimeField label="何时再问" value={editFollowUp} emptyText="未设置，点这里选择" onChange={setEditFollowUp} />
            <ErrorText text={error} />
            <div className="actions">
              <button type="button" className="quiet" onClick={() => setEditItem(null)}>取消</button>
              <button className="primary" type="submit" disabled={busy || !editFollowUp}>{busy ? "正在保存…" : "保存"}</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
