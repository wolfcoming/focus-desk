import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { WeeklyPacket } from "./types";
import { AiBusy, AiThinking, Empty, ErrorText, when } from "./widgets";

export function Weekly({ revision, onOpen }: { revision: number; onOpen: (projectId: number) => void }) {
  const [packet, setPacket] = useState<WeeklyPacket | null>(null);
  const [summary, setSummary] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setPacket(await api.weekly());
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  useEffect(() => {
    void load();
  }, [revision]);

  async function assist() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.weeklyAssist();
      setSummary(result.summary);
      setSource(result.source);
      setThinking(result.thinking ?? null);
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>周回顾</h1>
      <p className="lead">看一眼本周还堆着什么：临时任务、停滞子任务、到点等待，以及重要但没日期的事。</p>
      <ErrorText text={error} />
      <div className="actions" style={{ justifyContent: "flex-start", marginBottom: 12 }}>
        <button type="button" className="primary" disabled={busy} onClick={() => void assist()}>
          {busy ? "生成中…" : "生成回顾摘要"}
        </button>
      </div>
      {busy && <AiBusy label="正在写周回顾" />}
      {summary && (
        <div className="panel stack">
          <p className="note">{source === "ai" ? "模型摘要" : "规则摘要"}</p>
          <p>{summary}</p>
          <AiThinking text={thinking} />
        </div>
      )}

      <h2>临时任务</h2>
      {packet && packet.inbox.length === 0 && <Empty text="临时任务是空的。" />}
      <div className="list">
        {packet?.inbox.map((item) => (
          <article className="row" key={item.id}>
            <h3>{item.title}</h3>
          </article>
        ))}
      </div>

      <h2>停滞的子任务</h2>
      {packet && packet.stale.length === 0 && <Empty text="没有超过三天没动的子任务。" />}
      <div className="list">
        {packet?.stale.map((sub) => (
          <article className="row" key={sub.id}>
            <div>
              <h3>
                <button type="button" className="title-button" onClick={() => onOpen(sub.projectId)}>
                  {sub.projectName} · {sub.name}
                </button>
              </h3>
              <div className="meta">上次动过 {when(sub.lastTouchedAt)}</div>
            </div>
          </article>
        ))}
      </div>

      <h2>到点的等待</h2>
      {packet && packet.followUps.length === 0 && <Empty text="没有到点的等待。" />}
      <div className="list">
        {packet?.followUps.map((item) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">在等 {item.waitingOn} · {when(item.followUpAt)}</div>
            </div>
          </article>
        ))}
      </div>

      <h2>重要但没日期</h2>
      {packet && packet.undatedImportant.length === 0 && <Empty text="没有未设截止的重要任务。" />}
      <div className="list">
        {packet?.undatedImportant.map((item) => (
          <article className="row" key={item.id}>
            <div>
              <h3>
                {item.projectId ? (
                  <button type="button" className="title-button" onClick={() => onOpen(item.projectId as number)}>
                    {item.title}
                  </button>
                ) : (
                  item.title
                )}
              </h3>
              <div className="meta">{item.quadrant}{item.subprojectName ? ` · ${item.subprojectName}` : ""}</div>
            </div>
          </article>
        ))}
      </div>

      <h2>本周拒绝切换</h2>
      {packet && packet.overrides.length === 0 && <Empty text="这周没有留下拒绝切换的记录。" />}
      <div className="list">
        {packet?.overrides.map((item, index) => (
          <article className="row" key={`${item.createdAt}-${index}`}>
            <div>
              <h3>{item.rawText}</h3>
              <div className="meta">{when(item.createdAt)} · {item.verdict} · {item.reason}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
