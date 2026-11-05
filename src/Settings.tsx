import { useEffect, useState } from "react";
import { api, message } from "./api";
import type { Subproject, WorkLog } from "./types";
import { AiBusy, Empty, ErrorText, when } from "./widgets";

const progressLabel: Record<string, string> = {
  not_started: "未开始",
  doing: "进行中",
  done: "已完成",
};

function logStamp(log: WorkLog) {
  const label = progressLabel[log.progress] ?? log.progress;
  const percent = log.progress === "doing" && log.progressPercent != null ? ` ${log.progressPercent}%` : "";
  return `${when(log.createdAt)}${label ? ` · ${label}${percent}` : ""}`;
}

export function Settings({ revision }: { revision: number }) {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [dataPath, setDataPath] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);

  useEffect(() => {
    void api.settings().then((settings) => {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setHasKey(settings.hasApiKey);
      setAutostart(settings.autostart);
      setDataPath(settings.dataPath);
    }).catch((reason) => setError(message(reason)));
  }, [revision]);

  useEffect(() => {
    void Promise.all([api.listWorkLogs(null), api.listSubprojects(null)])
      .then(([logs, nextSubs]) => {
        setWorkLogs(logs);
        setSubs(nextSubs);
      })
      .catch((reason) => setError(message(reason)));
  }, [revision]);

  async function testConnection() {
    if (testing) return;
    setTesting(true);
    setNote("");
    setError("");
    try {
      const result = await api.testAiConnection(
        baseUrl.trim() || null,
        model.trim() || null,
        apiKey.trim() || null,
      );
      setNote(result);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setTesting(false);
    }
  }

  async function loadDemo() {
    if (loadingDemo) return;
    setLoadingDemo(true);
    setNote("");
    setError("");
    try {
      await api.loadDemo();
      window.dispatchEvent(new Event("desk-changed"));
      setNote("已加载示例数据。");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoadingDemo(false);
    }
  }

  const subName = (id: number) => {
    const sub = subs.find((item) => item.id === id);
    if (!sub) return "未知子任务";
    return `${sub.projectName} · ${sub.name}`;
  };

  return (
    <section>
      <h1>设置</h1>
      <p className="lead">模型用于待办关联项目、今日三件建议、周回顾摘要、阻塞问询话术，以及对上「我正在做的事」。要不要切换仍由本地规则决定。钥匙放在系统凭据里。</p>
      <ErrorText text={error} />
      <div className="stack">
        <label className="field">接口地址<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label className="field">模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label className="field">
          API 钥匙
          <input type="password" value={apiKey} placeholder={hasKey ? "已保存，留空则不改" : "还没有"} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <p className="note">{hasKey ? "钥匙已在系统凭据里，这里不再显示原文。留空再保存，不会改掉它。" : "还没有保存过钥匙。"}</p>
        <label className="checks">
          <input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} />
          登录时启动
        </label>
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="primary" onClick={() => void api.saveSettings({
            baseUrl,
            model,
            apiKey: apiKey.trim() ? apiKey : null,
            clearApiKey: false,
            autostart,
          }).then((settings) => {
            setHasKey(settings.hasApiKey);
            setApiKey("");
            if (apiKey.trim() && !settings.hasApiKey) {
              setNote("");
              setError("钥匙没有写进系统凭据。");
              return;
            }
            setNote(settings.hasApiKey ? "已保存。" : "已保存。这次没有填写钥匙。");
            setError("");
          }).catch((reason) => setError(message(reason)))}>保存</button>
          <button
            type="button"
            disabled={testing || (!hasKey && !apiKey.trim())}
            onClick={() => void testConnection()}
          >
            {testing ? "正在检测…" : "检测连接"}
          </button>
          {hasKey && <button className="quiet" onClick={() => void api.saveSettings({
            baseUrl, model, apiKey: null, clearApiKey: true, autostart,
          }).then((settings) => {
            setHasKey(settings.hasApiKey);
            setNote("已清除钥匙。");
          }).catch((reason) => setError(message(reason)))}>清除钥匙</button>}
          <button onClick={() => void api.checkReminders().then((reminder) => {
            setNote(reminder ? `已弹出：${reminder.title}` : "现在没有到点的提醒。");
          }).catch((reason) => setError(message(reason)))}>立即检查提醒</button>
          <button type="button" disabled={loadingDemo} onClick={() => void loadDemo()}>
            {loadingDemo ? "加载中…" : "加载示例数据"}
          </button>
        </div>
        {testing && <AiBusy label="正在检测模型连接" />}
        {note && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{note}</p>}
        <p className="note">数据文件：{dataPath}</p>
        <p className="note">新库默认是空的。示例数据只会在你点「加载示例数据」时写入一次。</p>
        <p className="note">关掉主窗口后程序仍在托盘里。右下角图标可以重新打开，或退出。</p>
      </div>

      <section className="project-section" style={{ marginTop: 28 }}>
        <div className="section-head">
          <h2>操作日志</h2>
          <span className="section-count">{workLogs.length}</span>
        </div>
        <p className="note">关键进展与调整进度时的工作日志都在这里。</p>
        {workLogs.length === 0 ? (
          <Empty text="还没有操作日志。" />
        ) : (
          <ul className="log-history">
            {workLogs.map((log) => (
              <li key={log.id}>
                <span>
                  {logStamp(log)} · {subName(log.subprojectId)}
                  {log.kind === "work" ? " · 工作日志" : " · 关键进展"}
                </span>
                {log.body.trim() || "（无文字）"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
