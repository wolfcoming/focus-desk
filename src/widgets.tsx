import { useEffect, useState, type ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** 0–100 进度滑块，不靠数字输入 */
export function PercentSlider({
  value,
  onChange,
  onCommit,
  label = "完成度",
}: {
  value: number;
  onChange: (value: number) => void;
  /** 拖动结束或键盘调完时触发，便于即时保存 */
  onCommit?: (value: number) => void;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  function commitFrom(event: { currentTarget: HTMLInputElement }) {
    onCommit?.(Number(event.currentTarget.value));
  }
  return (
    <label className="field percent-slider">
      <span className="percent-slider-head">
        <span>{label}</span>
        <span className="percent-slider-value">{clamped}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={clamped}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped}%`}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={commitFrom}
        onKeyUp={(event) => {
          if (
            event.key === "ArrowLeft"
            || event.key === "ArrowRight"
            || event.key === "ArrowUp"
            || event.key === "ArrowDown"
            || event.key === "Home"
            || event.key === "End"
            || event.key === "PageUp"
            || event.key === "PageDown"
          ) {
            commitFrom(event);
          }
        }}
      />
    </label>
  );
}

export function ErrorText({ text }: { text: string }) {
  if (!text) return null;
  return <p className="error">{text}</p>;
}

export function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "chevron open" : "chevron"} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M5 3.5 9 7 5 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const days = [
  ["1", "一"],
  ["2", "二"],
  ["3", "三"],
  ["4", "四"],
  ["5", "五"],
  ["6", "六"],
  ["7", "日"],
];

export function DayChecks({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = new Set(value.split(",").map((part) => part.trim()).filter(Boolean));
  return (
    <div className="checks">
      {days.map(([id, label]) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.has(id)}
            onChange={(event) => {
              if (event.target.checked) selected.add(id);
              else selected.delete(id);
              onChange(days.map(([day]) => day).filter((day) => selected.has(day)).join(","));
            }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function splitDateTime(value: string) {
  if (!value) return { date: todayKey(), time: "18:00" };
  const [date, time = "18:00"] = value.split("T");
  return { date: date || todayKey(), time: time.slice(0, 5) || "18:00" };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
}

function monthCells(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split("-").map(Number);
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const total = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let index = 0; index < offset; index += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  return cells;
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const hours = Array.from({ length: 24 }, (_, index) => pad2(index));
const minutes = Array.from({ length: 60 }, (_, index) => pad2(index));

export function DateTimeField({
  label,
  value,
  onChange,
  emptyText = "未设置",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(todayKey());
  const [draftTime, setDraftTime] = useState("18:00");
  const [viewMonth, setViewMonth] = useState(() => todayKey().slice(0, 7));

  const hour = draftTime.slice(0, 2);
  const minute = draftTime.slice(3, 5) || "00";
  const cells = monthCells(viewMonth);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  function openPicker() {
    const next = splitDateTime(value);
    setDraftDate(next.date);
    setDraftTime(next.time);
    setViewMonth(next.date.slice(0, 7));
    setOpen(true);
  }

  return (
    <>
      <div className="field">
        <span>{label}</span>
        <button type="button" className="picker-trigger" onClick={openPicker}>
          {value ? when(value) : emptyText}
        </button>
      </div>
      {open && (
        <div
          className="modal-backdrop picker-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="picker-title">{label}</h2>
            <div className="stack">
              <div className="picker-calendar">
                <div className="picker-calendar-head">
                  <button type="button" className="quiet" aria-label="上个月" onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}>‹</button>
                  <span>{viewMonth.slice(0, 4)} 年 {Number(viewMonth.slice(5, 7))} 月</span>
                  <button type="button" className="quiet" aria-label="下个月" onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}>›</button>
                </div>
                <div className="picker-weekdays">
                  {weekdays.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="picker-days">
                  {cells.map((cell, index) =>
                    cell ? (
                      <button
                        type="button"
                        key={cell}
                        className={cell === draftDate ? "picker-day selected" : "picker-day"}
                        onClick={() => setDraftDate(cell)}
                      >
                        {Number(cell.slice(-2))}
                      </button>
                    ) : (
                      <span key={`blank-${index}`} className="picker-day blank" />
                    ),
                  )}
                </div>
              </div>
              <div className="picker-time">
                <span>时间</span>
                <select value={hour} onChange={(event) => setDraftTime(`${event.target.value}:${minute}`)}>
                  {hours.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <span>:</span>
                <select value={minute} onChange={(event) => setDraftTime(`${hour}:${event.target.value}`)}>
                  {minutes.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="actions">
                <button type="button" className="quiet" onClick={() => setOpen(false)}>取消</button>
                {value && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    清除
                  </button>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (!draftDate) return;
                    onChange(`${draftDate}T${draftTime || "18:00"}`);
                    setOpen(false);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hour = value.slice(0, 2) || "09";
  const minute = value.slice(3, 5) || "00";
  const minuteValue = minutes.includes(minute) ? minute : "00";
  return (
    <div className="field">
      <span>{label}</span>
      <div className="picker-time">
        <select value={hour} onChange={(event) => onChange(`${event.target.value}:${minuteValue}`)}>
          {hours.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span>:</span>
        <select value={minuteValue} onChange={(event) => onChange(`${hour}:${event.target.value}`)}>
          {minutes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </div>
  );
}

export function when(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const busySteps = ["正在连接模型…", "AI 思考中…", "正在整理结果…"];

export function AiBusy({ label = "AI 思考中" }: { label?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % busySteps.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="ai-busy" role="status" aria-live="polite">
      <span className="ai-busy-dot" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p className="note">{busySteps[step]}</p>
      </div>
    </div>
  );
}

export function AiThinking({ text }: { text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <details className="ai-thinking" open>
      <summary>思考过程</summary>
      <pre>{text.trim()}</pre>
    </details>
  );
}

function formatLocalIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function weekdayShort(date: Date) {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function atDay(daysAhead: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function laterToday(hour = 20) {
  const now = new Date();
  const later = new Date(now);
  later.setHours(hour, 0, 0, 0);
  if (later <= now) {
    later.setHours(now.getHours() + 1, 0, 0, 0);
  }
  return later;
}

function nextMonday(hour = 9) {
  const date = new Date();
  const day = date.getDay();
  const delta = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  date.setDate(date.getDate() + delta);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function presetHint(date: Date, withWeekday = false) {
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (!withWeekday) return time;
  return `周${weekdayShort(date)}, ${time}`;
}

type ScheduleMenu = "due" | "remind" | null;

export function TodoScheduleBar({
  dueAt,
  remindAt,
  onDueChange,
  onRemindChange,
}: {
  dueAt: string | null;
  remindAt: string | null;
  onDueChange: (value: string | null) => void;
  onRemindChange: (value: string | null) => void;
}) {
  const [menu, setMenu] = useState<ScheduleMenu>(null);
  const [custom, setCustom] = useState<ScheduleMenu>(null);
  const [draftDate, setDraftDate] = useState(todayKey());
  const [draftTime, setDraftTime] = useState("18:00");
  const [viewMonth, setViewMonth] = useState(() => todayKey().slice(0, 7));

  const later = laterToday();
  const tomorrow = atDay(1, 9);
  const nextWeek = nextMonday();
  const dueToday = atDay(0, 18);
  const dueTomorrow = atDay(1, 18);
  const dueNextWeek = nextMonday(18);

  useEffect(() => {
    if (!menu && !custom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenu(null);
      setCustom(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu, custom]);

  function openCustom(kind: "due" | "remind") {
    const current = kind === "due" ? dueAt : remindAt;
    const next = splitDateTime(current ?? "");
    setDraftDate(next.date);
    setDraftTime(next.time);
    setViewMonth(next.date.slice(0, 7));
    setMenu(null);
    setCustom(kind);
  }

  function applyCustom() {
    if (!custom || !draftDate) return;
    const stamp = `${draftDate}T${draftTime || "18:00"}`;
    if (custom === "due") onDueChange(stamp);
    else onRemindChange(stamp);
    setCustom(null);
  }

  const hour = draftTime.slice(0, 2);
  const minute = draftTime.slice(3, 5) || "00";
  const cells = monthCells(viewMonth);

  return (
    <div className="todo-schedule">
      <div className="todo-schedule-icons">
        <div className="todo-schedule-slot">
          <button
            type="button"
            className={dueAt ? "todo-icon-btn active" : "todo-icon-btn"}
            aria-label="截止日期"
            aria-expanded={menu === "due"}
            onClick={() => setMenu((current) => current === "due" ? null : "due")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          {menu === "due" && (
            <div className="todo-pop">
              <div className="todo-pop-title">截止日期</div>
              <button type="button" className="todo-pop-item" onClick={() => { onDueChange(formatLocalIso(dueToday)); setMenu(null); }}>
                <span>今天</span>
                <span className="meta">{presetHint(dueToday)}</span>
              </button>
              <button type="button" className="todo-pop-item" onClick={() => { onDueChange(formatLocalIso(dueTomorrow)); setMenu(null); }}>
                <span>明天</span>
                <span className="meta">{presetHint(dueTomorrow, true)}</span>
              </button>
              <button type="button" className="todo-pop-item" onClick={() => { onDueChange(formatLocalIso(dueNextWeek)); setMenu(null); }}>
                <span>下周</span>
                <span className="meta">{presetHint(dueNextWeek, true)}</span>
              </button>
              <div className="todo-pop-divider" />
              <button type="button" className="todo-pop-item" onClick={() => openCustom("due")}>
                <span>选择日期和时间</span>
              </button>
              {dueAt && (
                <button type="button" className="todo-pop-item danger" onClick={() => { onDueChange(null); setMenu(null); }}>
                  <span>清除截止日期</span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="todo-schedule-slot">
          <button
            type="button"
            className={remindAt ? "todo-icon-btn active" : "todo-icon-btn"}
            aria-label="提醒时间"
            aria-expanded={menu === "remind"}
            onClick={() => setMenu((current) => current === "remind" ? null : "remind")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22a2.2 2.2 0 0 0 2.1-1.5H9.9A2.2 2.2 0 0 0 12 22Z" fill="currentColor" />
              <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.8 1.8c-.4.4-.1 1.2.5 1.2h14.6c.6 0 .9-.8.5-1.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </button>
          {menu === "remind" && (
            <div className="todo-pop">
              <div className="todo-pop-title">提醒</div>
              <button type="button" className="todo-pop-item" onClick={() => { onRemindChange(formatLocalIso(later)); setMenu(null); }}>
                <span>今日晚些时候</span>
                <span className="meta">{presetHint(later)}</span>
              </button>
              <button type="button" className="todo-pop-item" onClick={() => { onRemindChange(formatLocalIso(tomorrow)); setMenu(null); }}>
                <span>明天</span>
                <span className="meta">{presetHint(tomorrow, true)}</span>
              </button>
              <button type="button" className="todo-pop-item" onClick={() => { onRemindChange(formatLocalIso(nextWeek)); setMenu(null); }}>
                <span>下周</span>
                <span className="meta">{presetHint(nextWeek, true)}</span>
              </button>
              <div className="todo-pop-divider" />
              <button type="button" className="todo-pop-item" onClick={() => openCustom("remind")}>
                <span>选择日期和时间</span>
              </button>
              {remindAt && (
                <button type="button" className="todo-pop-item danger" onClick={() => { onRemindChange(null); setMenu(null); }}>
                  <span>清除提醒</span>
                </button>
              )}
            </div>
          )}
        </div>
        {(dueAt || remindAt) && (
          <div className="todo-schedule-chips">
            {dueAt && <span className="todo-chip">截止 {when(dueAt)}</span>}
            {remindAt && <span className="todo-chip">提醒 {when(remindAt)}</span>}
          </div>
        )}
      </div>
      {menu && (
        <button type="button" className="todo-pop-scrim" aria-label="关闭菜单" onClick={() => setMenu(null)} />
      )}
      {custom && (
        <div
          className="modal-backdrop picker-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCustom(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="todo-picker-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="todo-picker-title">{custom === "due" ? "截止日期" : "提醒时间"}</h2>
            <div className="stack">
              <div className="picker-calendar">
                <div className="picker-calendar-head">
                  <button type="button" className="quiet" aria-label="上个月" onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}>‹</button>
                  <span>{viewMonth.slice(0, 4)} 年 {Number(viewMonth.slice(5, 7))} 月</span>
                  <button type="button" className="quiet" aria-label="下个月" onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}>›</button>
                </div>
                <div className="picker-weekdays">
                  {weekdays.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="picker-days">
                  {cells.map((cell, index) =>
                    cell ? (
                      <button
                        type="button"
                        key={cell}
                        className={cell === draftDate ? "picker-day selected" : "picker-day"}
                        onClick={() => setDraftDate(cell)}
                      >
                        {Number(cell.slice(-2))}
                      </button>
                    ) : (
                      <span key={`blank-${index}`} className="picker-day blank" />
                    ),
                  )}
                </div>
              </div>
              <div className="picker-time">
                <span>时间</span>
                <select value={hour} onChange={(event) => setDraftTime(`${event.target.value}:${minute}`)}>
                  {hours.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <span>:</span>
                <select value={minute} onChange={(event) => setDraftTime(`${hour}:${event.target.value}`)}>
                  {minutes.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="actions">
                <button type="button" className="quiet" onClick={() => setCustom(null)}>取消</button>
                <button type="button" className="primary" onClick={applyCustom}>确定</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ToastKind = "ok" | "error";
type ToastPayload = { message: string; kind?: ToastKind };

const TOAST_EVENT = "desk-toast";

export function showToast(message: string, kind: ToastKind = "ok") {
  const text = message.trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message: text, kind } }));
}

export function ToastHost() {
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);

  useEffect(() => {
    let hideTimer = 0;
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      if (!detail?.message?.trim()) return;
      const id = Date.now();
      setToast({ id, message: detail.message.trim(), kind: detail.kind ?? "ok" });
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 2800);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className={`desk-toast desk-toast-${toast.kind}`} role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
