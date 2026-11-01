import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { Item, MorningResult, TodayBoard } from "./types";
import { dailyState } from "./types";
import { AiBusy, AiThinking, Empty, ErrorText, when } from "./widgets";

export function Today({ revision }: { revision: number }) {
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [pick, setPick] = useState("");
  const [morning, setMorning] = useState<MorningResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [nextBoard, nextTasks] = await Promise.all([api.today(), api.listItems("task")]);
      setBoard(nextBoard);
      setTasks(nextTasks.filter((item) => item.status === "open" || item.status === "doing"));
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

  return (
    <section>
      <h1>今天</h1>
      <p className="lead">重要和紧急由你标成四象限。截止时间可选。弹窗只在到点、过宽限和停滞时出现。</p>
      <ErrorText text={error} />
      <h2>今日三件</h2>
      {board && board.slots.length === 0 && <Empty text="今天还没有自己选的三件。" />}
      {board && board.slots.length < 3 && (
        <form
          className="capture"
          onSubmit={(event) => {
            event.preventDefault();
            const id = Number(pick);
            if (!id) return;
            void run(async () => {
              await api.setToday([...board.slots.map((slot) => slot.id), id]);
              setPick("");
            });
          }}
        >
          <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label="选择要放入今天的任务">
            <option value="">从现有任务里选一件</option>
            {tasks
              .filter((item) => !board.slots.some((slot) => slot.id === item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subprojectName ? `${item.subprojectName} · ` : ""}{item.title}
                </option>
              ))}
          </select>
          <button className="primary" type="submit" disabled={!pick}>加入</button>
        </form>
      )}
      {board && board.slots.length >= 3 && <p className="note">已经满三件。先移出一件，再换别的。</p>}
      <div className="list">
        {board?.slots.map((item, index) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{index + 1}. {item.title}</h3>
              <div className="meta">
                {item.quadrant} · {item.subprojectName} · {item.estimateMin} 分钟
                {item.status === "doing" ? " · 正在做" : ""}
                {item.dueAt ? ` · ${when(item.dueAt)}` : ""}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => void run(() => api.startItem(item.id))}>开始</button>
              <button onClick={() => void run(() => api.completeItem(item.id))}>完成</button>
              <button className="quiet" onClick={() => void run(() => api.setToday(board.slots.filter((slot) => slot.id !== item.id).map((slot) => slot.id)))}>移出</button>
            </div>
          </article>
        ))}
      </div>
      <div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <button
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
        {morning && morning.picks.length > 0 && (
          <button className="primary" disabled={aiBusy} onClick={() => void run(() => api.setToday(morning.picks.map((pick) => pick.id)))}>用这三件</button>
        )}
      </div>
      {aiBusy && <AiBusy label="正在生成今日建议" />}
      {morning && <p className="note">{morning.note}</p>}
      {morning && <AiThinking text={morning.thinking} />}
      {morning?.picks.map((pick) => (
        <p key={pick.id} className="note">{pick.title}：{pick.reason}</p>
      ))}

      <h2>今天的日常</h2>
      {board && board.dailies.length === 0 && <Empty text="今天没有日常义务。" />}
      <div className="list">
        {board?.dailies.map(({ item, state }) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">{item.windowStart}–{item.windowEnd} · {dailyState[state] ?? state}</div>
            </div>
            {state !== "done" && (
              <button onClick={() => void run(() => api.completeItem(item.id))}>做完了</button>
            )}
          </article>
        ))}
      </div>

      <h2>杂事，不单独打断</h2>
      {board && board.chores.length === 0 && <Empty text="没有不重要但紧急的事。" />}
      <div className="list">
        {board?.chores.map((item) => (
          <article className="row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <div className="meta">{item.quadrant}{item.dueAt ? ` · ${when(item.dueAt)}` : ""}</div>
            </div>
            <button onClick={() => void run(() => api.completeItem(item.id))}>完成</button>
          </article>
        ))}
      </div>
    </section>
  );
}
