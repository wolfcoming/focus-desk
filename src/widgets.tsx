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

export function EstimateSelect({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <select value={value ?? ""} onChange={(event) => onChange(Number(event.target.value))}>
      <option value="" disabled>选择时长</option>
      {[15, 25, 50, 90].map((minutes) => (
        <option key={minutes} value={minutes}>{minutes} 分钟</option>
      ))}
    </select>
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
              <Field label="日期"><input type="date" autoFocus value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></Field>
              <Field label="时间"><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} /></Field>
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
