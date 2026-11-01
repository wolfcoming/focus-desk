import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, message } from "./api";
import type { Judgment, Reminder as ReminderItem } from "./types";
import { classLabel, verdictLabel } from "./types";
import { AiBusy, AiThinking, ErrorText } from "./widgets";

export function Reminder() {
  const [reminder, setReminder] = useState<ReminderItem | null>(null);
  const [text, setText] = useState("");
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [judging, setJudging] = useState(false);
  const [judgingBusy, setJudgingBusy] = useState(false);

  useEffect(() => {
    void api.activeReminder().then(setReminder).catch((reason) => setError(message(reason)));
    let unlisten: (() => void) | undefined;
    void listen<ReminderItem>("reminder://open", (event) => {
      setReminder(event.payload);
      setText("");
      setJudgment(null);
      setJudging(false);
      setJudgingBusy(false);
      setBusy(false);
      setError("");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  async function preview() {
    if (judgingBusy) return;
    setJudgingBusy(true);
    setJudgment(null);
    try {
      setJudgment(await api.previewJudgment(text));
      setError("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setJudgingBusy(false);
    }
  }

  async function finish(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await getCurrentWindow().hide();
      setBusy(false);
    } catch (reason) {
      setError(message(reason));
      setBusy(false);
    }
  }

  if (!reminder) {
    return <main className="reminder"><h1>现在没有待处理的提醒</h1></main>;
  }

  const stalling = reminder.class === "stall";

  return (
    <main className="reminder">
      <p className="meta">{classLabel[reminder.class] ?? reminder.class}</p>
      <h1>{reminder.title}</h1>
      <p>{reminder.detail}</p>
      <ErrorText text={error} />
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="primary" type="button" disabled={busy} onClick={() => setJudging(true)}>判断要不要换</button>
        <button type="button" disabled={busy} onClick={() => void finish(() => api.acknowledgeReminder())}>知道了</button>
      </div>
      {judging && stalling && (
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" disabled={busy} onClick={() => void finish(() => api.resolveStall("continue"))}>继续跟踪</button>
          <button type="button" disabled={busy} onClick={() => void finish(() => api.resolveStall("pause"))}>暂停</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void finish(() => api.resolveStall("archive"))}>归档</button>
        </div>
      )}
      {judging && !stalling && (
        <>
          <label className="field">
            我现在在做什么
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="写一句即可" />
          </label>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" disabled={judgingBusy || !text.trim()} onClick={() => void preview()}>
              {judgingBusy ? "判断中…" : "给出判断"}
            </button>
          </div>
          {judgingBusy && <AiBusy label="正在判断要不要换" />}
          {judgment && (
            <div className="verdict">
              <strong className={judgment.verdict === "switch" ? "must" : undefined}>{verdictLabel[judgment.verdict]}</strong>
              <p>{judgment.reason}</p>
              <AiThinking text={judgment.thinking} />
              <p className="note">
                {judgment.matchedTitle ? `对上了：${judgment.matchedTitle}` : "没有对上已有任务，这句话只记日志。"}
              </p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="primary" disabled={busy} onClick={() => void finish(() => api.resolveReminder(text, true))}>按建议做</button>
                <button disabled={busy} onClick={() => void finish(() => api.resolveReminder(text, false))}>仍继续手头的</button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
