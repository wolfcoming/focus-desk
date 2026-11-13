import { useEffect, useState } from "react";
import { isAndroid } from "./android/platform";
import { api, message } from "./api";
import type { Item, MorningResult, Subproject, TodayBoard } from "./types";
import { dailyState } from "./types";
import { AiBusy, AiThinking, Empty, ErrorText, when } from "./widgets";

function subProgressLabel(sub: Subproject | undefined) {
  if (!sub) return "进度：—";
  if (sub.progress === "done" || sub.status === "done") return "进度：100%";
  if (sub.progress === "not_started") return "进度：0%";
  if (sub.progressPercent != null) return `进度：${sub.progressPercent}%`;
  if (sub.progress === "doing") return "进度：进行中";
  return "进度：—";
}

export function Today({
  revision,
  onOpen,
  onOpenTodos,
}: {
  revision: number;
  onOpen: (projectId: number, subprojectId?: number | null) => void;
  onOpenTodos?: () => void;
}) {
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [morning, setMorning] = useState<MorningResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const mobile = isAndroid();

  async function load() {
    try {
      const [nextBoard, nextTasks, nextTodos, nextSubs] = await Promise.all([
        api.today(),
        api.listItems("task"),
        api.listItems("todo"),
        api.listSubprojects(null),
      ]);
      const openish = (item: Item) => item.status === "open" || item.status === "doing";
      setBoard(nextBoard);
      setCandidates([
        ...nextTasks.filter(openish),
        ...nextTodos.filter(openish),
      ]);
      setSubs(nextSubs);
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  useEffect(() => {
    void load();
  }, [revision]);

  useEffect(() => {
    if (mobile || pickerSlot == null) return;
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".plate-pick-wrap")) return;
      setPickerSlot(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerSlot(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobile, pickerSlot]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }

  function openItem(item: Item) {
    if (item.subprojectId != null) {
      const linked = subs.find((sub) => sub.id === item.subprojectId);
      const projectId = item.projectId ?? linked?.projectId ?? null;
      if (projectId != null) {
        onOpen(projectId, item.subprojectId);
        return;
      }
    }
    if (item.projectId != null) {
      onOpen(item.projectId, null);
      return;
    }
    if (item.kind === "todo") onOpenTodos?.();
  }

  const slots = board?.slots ?? [];
  const plates = [0, 1, 2].map((index) => slots[index] ?? null);
  const completedCount = board?.completedCount ?? 0;
  const hasEmpty = plates.some((item) => item == null);

  const available = candidates.filter((item) => !slots.some((slot) => slot.id === item.id && slot.status !== "done"));

  function placeInSlot(index: number, id: number) {
    void run(async () => {
      if (replaceIndex === index) {
        const next = slots.map((slot, slotIndex) => (slotIndex === index ? id : slot.id));
        await api.setToday(next);
      } else {
        await api.setToday([...slots.map((slot) => slot.id), id]);
      }
      setReplaceIndex(null);
      setPickerSlot(null);
    });
  }

  function openPicker(index: number, replacing = false) {
    setPickerSlot(index);
    setReplaceIndex(replacing ? index : null);
  }

  function closePicker() {
    setPickerSlot(null);
    setReplaceIndex(null);
  }

  function slotPicker(index: number, placeholder: string, ariaLabel: string) {
    if (mobile) {
      return (
        <button
          type="button"
          className="plate-pick-btn"
          aria-label={ariaLabel}
          onClick={() => openPicker(index)}
        >
          {placeholder}
        </button>
      );
    }
    const open = pickerSlot === index;
    return (
      <div className="plate-pick-wrap">
        <button
          type="button"
          className={open ? "plate-pick is-open" : "plate-pick"}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          onClick={() => setPickerSlot((current) => current === index ? null : index)}
        >
          <span>{placeholder}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10.2 12 15l5-4.8" /></svg>
        </button>
        {open ? (
          <div className="plate-pick-menu" role="listbox" aria-label={ariaLabel}>
            {available.length === 0 ? (
              <p className="plate-pick-empty">暂无可选。先去待办或项目加一条。</p>
            ) : available.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                className="plate-pick-item"
                onClick={() => placeInSlot(index, entry.id)}
              >
                <strong>{entry.title}</strong>
                <span>
                  {entry.kind === "todo" ? "待办" : "任务"}
                  {entry.subprojectName ? ` · ${entry.subprojectName}` : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="today-page">
      <h1>今天</h1>
      <p className="lead">{mobile ? "亲手挑最多三件重点。" : "今日三件是你亲手挑的重点；日常来自项目里的周期性子任务。重要和紧急都由你标四象限。"}</p>
      <ErrorText text={error} />

      <h2 className="today-focus-heading">
        今日三件
        <span className="today-done-hint">已完成 {completedCount} 件</span>
      </h2>
      <div className="plate-deck" aria-label="今日三件">
        {plates.map((item, index) => {
          if (!item) {
            return (
              <div key={`empty-${index}`} className={`plate empty${mobile ? " plate-empty-mobile" : ""}`}>
                <div className="plate-index">{mobile ? `${index + 1}` : `槽位 ${index + 1}`}</div>
                {slotPicker(
                  index,
                  mobile ? "添加今日重点" : "选择任务…",
                  `为槽位 ${index + 1} 选择任务或待办`,
                )}
              </div>
            );
          }
          const done = item.status === "done";
          const lit = item.status === "doing";
          const isTask = item.kind === "task";
          const linkedSub = item.subprojectId != null
            ? subs.find((sub) => sub.id === item.subprojectId)
            : undefined;
          const canOpen = item.projectId != null || item.kind === "todo";
          const replacing = replaceIndex === index;
          return (
            <article
              key={item.id}
              className={[
                "plate",
                done ? "done" : "",
                lit ? "lit" : "",
                canOpen && !replacing ? "plate-openable" : "",
              ].filter(Boolean).join(" ")}
              onClick={canOpen && !replacing ? () => openItem(item) : undefined}
              onKeyDown={canOpen && !replacing ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openItem(item);
                }
              } : undefined}
              role={canOpen && !replacing ? "button" : undefined}
              tabIndex={canOpen && !replacing ? 0 : undefined}
            >
              <div className="plate-index">
                {done ? "已完成" : lit ? "正在做" : `第 ${index + 1} 件`}
              </div>
              <h3 className="plate-title">{item.title}</h3>
              <div className="plate-meta">
                {isTask ? (
                  <>
                    {subProgressLabel(linkedSub)}
                    {item.subprojectName ? ` · ${item.subprojectName}` : ""}
                  </>
                ) : (
                  <>
                    待办
                    {item.subprojectName ? ` · ${item.subprojectName}` : ""}
                  </>
                )}
                {item.dueAt ? (
                  <>
                    {" · "}
                    <span className="due">{when(item.dueAt)}</span>
                  </>
                ) : null}
              </div>
              <div className="plate-actions" onClick={(event) => event.stopPropagation()}>
                {replacing && !mobile ? (
                  <div className="plate-replace">
                    {slotPicker(index, "换上新的一件…", done ? "挑选一件替换已完成的槽位" : "挑选一件替换当前槽位")}
                    <button type="button" className="quiet" onClick={() => { setReplaceIndex(null); setPickerSlot(null); }}>
                      取消
                    </button>
                  </div>
                ) : done ? (
                  <button
                    type="button"
                    className="plate-continue"
                    onClick={() => {
                      if (mobile) openPicker(index, true);
                      else {
                        setReplaceIndex(index);
                        setPickerSlot(index);
                      }
                    }}
                  >
                    继续挑战
                  </button>
                ) : (
                  <>
                    {isTask ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => openItem(item)}
                      >
                        调整进度
                      </button>
                    ) : (
                      <button type="button" className="primary" onClick={() => void run(() => api.completeItem(item.id))}>
                        完成
                      </button>
                    )}
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        if (mobile) openPicker(index, true);
                        else {
                          setReplaceIndex(index);
                          setPickerSlot(index);
                        }
                      }}
                    >
                      替换
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void run(() => api.setToday(slots.filter((slot) => slot.id !== item.id).map((slot) => slot.id)))}
                    >
                      移出
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {mobile && pickerSlot != null && (
        <div className="android-sheet-backdrop" role="presentation" onClick={closePicker}>
          <div
            className="android-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="选择今日重点"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="android-sheet-handle" aria-hidden />
            <div className="android-sheet-head">
              <h3>选择今日重点</h3>
              <button type="button" className="quiet" onClick={closePicker}>关闭</button>
            </div>
            {available.length === 0 ? (
              <Empty text="暂无可选。先去待办或项目加一条。" />
            ) : (
              <div className="android-sheet-list">
                {available.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="android-sheet-item"
                    onClick={() => placeInSlot(pickerSlot, entry.id)}
                  >
                    <span className="android-sheet-item-kind">{entry.kind === "todo" ? "待办" : "任务"}</span>
                    <span className="android-sheet-item-title">{entry.title}</span>
                    {entry.subprojectName ? (
                      <span className="android-sheet-item-meta">{entry.subprojectName}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`actions today-suggest-actions${mobile ? " today-suggest-actions-mobile" : ""}`} style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <button
          type="button"
          className={mobile ? "quiet today-suggest-btn" : undefined}
          disabled={aiBusy}
          onClick={() => {
            if (aiBusy) return;
            setAiBusy(true);
            void (async () => {
              try {
                setMorning(await api.morning());
                setError("");
              } catch (reason) {
                setError(message(reason));
              } finally {
                setAiBusy(false);
              }
            })();
          }}
        >
          {aiBusy ? "生成中…" : "生成建议"}
        </button>
        {morning && morning.picks.length > 0 && hasEmpty && (
          <button
            type="button"
            className="primary"
            disabled={aiBusy}
            onClick={() => void run(() => api.setToday(morning.picks.map((entry) => entry.id)))}
          >
            用这三件
          </button>
        )}
      </div>
      {aiBusy && <AiBusy label="正在生成今日建议" />}
      {morning && <p className="note">{morning.note}</p>}
      {morning && <AiThinking text={morning.thinking} />}
      {morning?.picks.map((entry) => (
        <p key={entry.id} className="note">{entry.title}：{entry.reason}</p>
      ))}

      <h2>今天的日常</h2>
      {board && board.dailies.length === 0 && (
        <Empty text={mobile ? "今天没有日常。去项目里建周期性子任务。" : "今天没有周期性日常。去项目里建「周期性子任务」即可出现。"} />
      )}
      <div className="list">
        {board?.dailies.map(({ item, state }) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">{item.windowStart}–{item.windowEnd} · {dailyState[state] ?? state}</div>
            </div>
            {state !== "done" && (
              <button type="button" onClick={() => void run(() => api.completeItem(item.id))}>做完了</button>
            )}
          </article>
        ))}
      </div>

      <div className="today-section-divider" role="separator" aria-hidden />

      <h2>杂事，不单独打断</h2>
      {board && board.chores.length === 0 && <Empty text="没有不重要但紧急的事。" />}
      <div className="list">
        {board?.chores.map((item) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">{item.quadrant}{item.dueAt ? ` · ${when(item.dueAt)}` : ""}</div>
            </div>
            <button type="button" onClick={() => void run(() => api.completeItem(item.id))}>完成</button>
          </article>
        ))}
      </div>
    </section>
  );
}
