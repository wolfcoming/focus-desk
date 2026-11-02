import { useEffect, useState, type ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
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
