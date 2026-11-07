import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, message } from "./api";
import type { Reminder as ReminderItem } from "./types";
import { classLabel } from "./types";
import { DateTimeField, ErrorText } from "./widgets";

const postponeOptions: { label: string; minutes: number }[] = [
  { label: "1 小时", minutes: 60 },
  { label: "3 小时", minutes: 180 },
  { label: "1 天", minutes: 24 * 60 },
  { label: "3 天", minutes: 3 * 24 * 60 },
];

export function Reminder() {
  const [reminder, setReminder] = useState<ReminderItem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [customAt, setCustomAt] = useState("");

  useEffect(() => {
    void api.activeReminder().then(setReminder).catch((reason) => setError(message(reason)));
    let unlisten: (() => void) | undefined;
    void listen<ReminderItem>("reminder://open", (event) => {
      setReminder(event.payload);
      setBusy(false);
      setPostponeOpen(false);
      setCustomAt("");
      setError("");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

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

  async function openDetail() {
    try {
      await api.openReminderDetail();
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  async function postpone(minutes: number | null, at: string | null) {
    await finish(() => api.postponeReminderDue(minutes, at));
    setPostponeOpen(false);
  }

  if (!reminder) {
    return <main className="reminder"><h1>现在没有待处理的提醒</h1></main>;
  }

  const stalling = reminder.class === "stall";
  const canOpen = reminder.itemId != null || reminder.subprojectId != null;
  const canPostpone = canOpen;

  return (
    <main className="reminder">
      <p className="meta">{classLabel[reminder.class] ?? reminder.class}</p>
      {canOpen ? (
        <h1>
          <button type="button" className="title-button reminder-title" onClick={() => void openDetail()}>
            {reminder.title}
          </button>
        </h1>
      ) : (
        <h1>{reminder.title}</h1>
      )}
      <p>{reminder.detail}</p>
      <ErrorText text={error} />
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="primary" type="button" disabled={busy} onClick={() => void finish(() => api.acknowledgeReminder())}>知道了</button>
        {stalling && (
          <>
            <button type="button" disabled={busy} onClick={() => void finish(() => api.resolveStall("continue"))}>继续跟踪</button>
            <button type="button" disabled={busy} onClick={() => void finish(() => api.resolveStall("pause"))}>暂停</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void finish(() => api.resolveStall("archive"))}>归档</button>
          </>
        )}
        {canPostpone && (
          <button type="button" disabled={busy} onClick={() => setPostponeOpen((open) => !open)}>
            推迟截止时间
          </button>
        )}
      </div>
      {postponeOpen && (
        <div className="postpone-panel stack">
          <div className="postpone-options">
            {postponeOptions.map((option) => (
              <button
                key={option.minutes}
                type="button"
                disabled={busy}
                onClick={() => void postpone(option.minutes, null)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <DateTimeField
            label="自定义时间"
            value={customAt}
            emptyText="选一个晚于现在的时间"
            onChange={setCustomAt}
          />
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="primary"
              disabled={busy || !customAt}
              onClick={() => void postpone(null, customAt)}
            >
              用自定义时间
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => setPostponeOpen(false)}>收起</button>
          </div>
        </div>
      )}
    </main>
  );
}
