import { useEffect, useState } from "react";
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
  const [pick, setPick] = useState("");
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [morning, setMorning] = useState<MorningResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");

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
  const pickingForReplace = replaceIndex != null;

  const available = candidates.filter((item) => !slots.some((slot) => slot.id === item.id && slot.status !== "done"));

  return (
    <section className="today-page">
      <h1>今天</h1>
      <p className="lead">今日三件是你亲手挑的重点；日常来自项目里的周期性子任务。重要和紧急都由你标四象限。</p>
      <ErrorText text={error} />

      <h2 className="today-focus-heading">
        今日三件
        <span className="today-done-hint">已完成 {completedCount} 件</span>
      </h2>
      <div className="plate-deck" aria-label="今日三件">
        {plates.map((item, index) => {
          if (!item) {
            return (
              <div key={`empty-${index}`} className="plate empty">
                <div className="plate-index">槽位 {index + 1}</div>
                <div className="plate-slot-label">还空着</div>
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
          return (
            <article
              key={item.id}
              className={[
                "plate",
                done ? "done" : "",
                lit ? "lit" : "",
                canOpen ? "plate-openable" : "",
              ].filter(Boolean).join(" ")}
              onClick={canOpen ? () => openItem(item) : undefined}
              onKeyDown={canOpen ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openItem(item);
                }
              } : undefined}
              role={canOpen ? "button" : undefined}
              tabIndex={canOpen ? 0 : undefined}
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
              {done ? (
                <div className="plate-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="plate-continue"
                    onClick={() => {
                      setReplaceIndex(index);
                      setPick("");
                    }}
                  >
                    继续挑战
                  </button>
                </div>
              ) : (
                <div className="plate-actions" onClick={(event) => event.stopPropagation()}>
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
                    onClick={() => void run(() => api.setToday(slots.filter((slot) => slot.id !== item.id).map((slot) => slot.id)))}
                  >
                    移出
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {(hasEmpty || pickingForReplace) && (
        <div className="today-tools">
          <form
            className="capture"
            onSubmit={(event) => {
              event.preventDefault();
              const id = Number(pick);
              if (!id || !board) return;
              void run(async () => {
                if (replaceIndex != null) {
                  const next = slots.map((slot, index) => (index === replaceIndex ? id : slot.id));
                  await api.setToday(next);
                  setReplaceIndex(null);
                } else {
                  await api.setToday([...slots.map((slot) => slot.id), id]);
                }
                setPick("");
              });
            }}
          >
            <select
              value={pick}
              onChange={(event) => setPick(event.target.value)}
              aria-label={pickingForReplace ? "挑选一件替换已完成的槽位" : "从现有任务或待办里挑选一件"}
            >
              <option value="">
                {pickingForReplace ? "换上新的一件" : "从现有 任务/待办 里挑选一件"}
              </option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.kind === "todo" ? "待办" : "任务"}
                  {" · "}
                  {item.subprojectName ? `${item.subprojectName} · ` : ""}
                  {item.title}
                </option>
              ))}
            </select>
            <button className="primary" type="submit" disabled={!pick}>
              {pickingForReplace ? "换上" : "放入槽位"}
            </button>
            {pickingForReplace && (
              <button type="button" className="quiet" onClick={() => { setReplaceIndex(null); setPick(""); }}>
                取消
              </button>
            )}
          </form>
        </div>
      )}

      <div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <button
          type="button"
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
      {board && board.dailies.length === 0 && <Empty text="今天没有周期性日常。去项目里建「周期性子任务」即可出现。" />}
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
