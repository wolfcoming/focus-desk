import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { Project, Subproject, WorkLog } from "./types";
import { Empty, ErrorText, when } from "./widgets";

function stage(sub: Subproject) {
  if (sub.kind === "periodic") return "periodic";
  if (sub.progress === "not_started" || sub.progress === "doing" || sub.progress === "done") return sub.progress;
  if (sub.status === "done") return "done";
  if (sub.status === "active") return "doing";
  return "not_started";
}

function knownPercent(sub: Subproject) {
  const current = stage(sub);
  if (current === "done") return 100;
  if (current === "not_started") return 0;
  if (current === "doing") return sub.progressPercent;
  return null;
}

function isOverdue(sub: Subproject) {
  if (stage(sub) === "periodic" || stage(sub) === "done" || !sub.dueAt) return false;
  const due = new Date(sub.dueAt).getTime();
  return !Number.isNaN(due) && due < Date.now();
}

function isStale(sub: Subproject) {
  if (sub.kind === "periodic" || sub.status !== "active") return false;
  const touched = new Date(sub.lastTouchedAt).getTime();
  return !Number.isNaN(touched) && Date.now() - touched >= 3 * 24 * 60 * 60 * 1000;
}

export function Progress({
  revision,
  onOpen,
}: {
  revision: number;
  onOpen: (projectId: number) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([api.listProjects(), api.listSubprojects(null), api.listWorkLogs(null)])
      .then(([nextProjects, nextSubs, nextLogs]) => {
        setProjects(nextProjects);
        setSubs(nextSubs);
        setLogs(nextLogs);
        setError("");
      })
      .catch((reason) => setError(message(reason)));
  }, [revision]);

  const visible = projects.filter((project) => project.status !== "archived");
  const rows = visible.map((project) => {
    const mine = subs.filter((sub) => sub.projectId === project.id);
    const regular = mine.filter((sub) => sub.kind !== "periodic");
    const done = regular.filter((sub) => stage(sub) === "done").length;
    const doing = regular.filter((sub) => stage(sub) === "doing").length;
    const periodic = mine.length - regular.length;
    const overdue = regular.filter(isOverdue).length;
    const stale = regular.filter(isStale).length;
    const children = [...mine].sort((a, b) => {
      const order = (sub: Subproject) => {
        const current = stage(sub);
        if (current === "doing") return 0;
        if (current === "not_started") return 1;
        if (current === "done") return 2;
        return 3;
      };
      return order(a) - order(b) || a.name.localeCompare(b.name, "zh");
    });
    return { project, total: mine.length, done, doing, periodic, overdue, stale, children };
  }).sort((a, b) => {
    const band = (status: string) => (status === "active" ? 0 : status === "paused" ? 2 : 1);
    return band(a.project.status) - band(b.project.status)
      || Number(b.overdue > 0) - Number(a.overdue > 0)
      || a.project.name.localeCompare(b.project.name, "zh");
  });

  const activeCount = visible.filter((project) => project.status === "active").length;
  const overdueCount = rows.reduce((sum, row) => sum + row.overdue, 0);
  const staleCount = rows.reduce((sum, row) => sum + row.stale, 0);

  return (
    <section>
      <h1>进度</h1>
      <p className="lead">大项目只记数量。进度条在每个常规子任务上：已完成是满的，未开始是空的，进行中用写下的百分比。</p>
      <ErrorText text={error} />
      <div className="stats">
        <div><strong>{activeCount}</strong>进行中的大项目</div>
        <div><strong>{overdueCount}</strong>已过截止的子任务</div>
        <div><strong>{staleCount}</strong>三天没动</div>
      </div>
      {visible.length === 0 && !error && <Empty text="还没有大项目。" />}
      <div className="list">
        {rows.map((row) => {
          const warnings = [
            row.stale ? "3 天没动" : "",
            row.overdue ? `${row.overdue} 个已过截止` : "",
          ].filter(Boolean);
          return (
            <article className="preview-block" key={row.project.id}>
              <button type="button" className="preview-row" onClick={() => onOpen(row.project.id)}>
                <div className="preview-top">
                  <h3>{row.project.name}</h3>
                  <span className="meta">{row.project.status === "active" ? "进行中" : row.project.status === "paused" ? "暂停" : "即将开始"}</span>
                </div>
                <div className="meta">{row.project.outcome || "还没有写描述。"}</div>
                <div className="meta">
                  {`子任务 ${row.total} · 周期性 ${row.periodic} · 已完成 ${row.done} · 进行中 ${row.doing}`}
                  {warnings.length > 0 && <span className="must"> · {warnings.join(" · ")}</span>}
                </div>
              </button>
              {row.children.length > 0 && (
                <div className="preview-subs">
                  {row.children.map((sub) => {
                    const current = stage(sub);
                    const percent = knownPercent(sub);
                    const latest = logs.find((log) => log.subprojectId === sub.id);
                    const label = current === "periodic"
                      ? "周期性"
                      : current === "done"
                        ? "已完成"
                        : current === "doing"
                          ? "进行中"
                          : "未开始";
                    return (
                      <button type="button" className="preview-sub" key={sub.id} onClick={() => onOpen(row.project.id)}>
                        <div className="preview-top">
                          <h3>{sub.name}</h3>
                          <span className="meta">{label}{percent != null ? ` ${percent}%` : current === "doing" ? " · 没写进度" : ""}</span>
                        </div>
                        {current !== "periodic" && <div className="bar" aria-hidden="true"><span style={{ width: `${percent ?? 0}%` }} /></div>}
                        {(isStale(sub) || isOverdue(sub)) && (
                          <div className="meta must">{[isStale(sub) ? "3 天没动" : "", isOverdue(sub) ? "已过截止" : ""].filter(Boolean).join(" · ")}</div>
                        )}
                        {latest && <div className="log-line">{when(latest.createdAt)} · {latest.body}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
