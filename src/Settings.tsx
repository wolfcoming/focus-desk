import { useEffect, useState } from "react";
import { isAndroid } from "./android/platform";
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
  const [supportsAutostart, setSupportsAutostart] = useState(true);
  const [dataPath, setDataPath] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [subs, setSubs] = useState<Subproject[]>([]);
  const [syncBaseUrl, setSyncBaseUrl] = useState("http://47.93.153.219:8081");
  const [syncEmail, setSyncEmail] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [syncSignedIn, setSyncSignedIn] = useState(false);
  const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [syncError, setSyncError] = useState("");
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);

  useEffect(() => {
    void api.settings().then((settings) => {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setHasKey(settings.hasApiKey);
      setAutostart(settings.autostart);
      setSupportsAutostart(settings.supportsAutostart);
      setDataPath(settings.dataPath);
    }).catch((reason) => setError(message(reason)));
    void api.syncStatus().then((status) => {
      setSyncBaseUrl(status.baseUrl);
      setSyncEmail(status.email ?? "");
      setSyncSignedIn(status.signedIn);
      setSyncLastAt(status.lastSyncAt);
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
      setNote("已清空现有数据并重新写入示例数据。");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoadingDemo(false);
    }
  }

  async function runSyncAuth(mode: "login" | "register") {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncNote(mode === "login" ? "正在登录…" : "正在注册…");
    setSyncError("");
    try {
      const status = mode === "login"
        ? await api.syncLogin(syncEmail.trim(), syncPassword, syncBaseUrl.trim())
        : await api.syncRegister(syncEmail.trim(), syncPassword, syncBaseUrl.trim());
      setSyncBaseUrl(status.baseUrl);
      setSyncEmail(status.email ?? syncEmail.trim());
      setSyncSignedIn(status.signedIn);
      setSyncLastAt(status.lastSyncAt);
      setSyncPassword("");
      setSyncNote(mode === "login" ? "已登录云端账号。" : "已注册并登录云端账号。");
    } catch (reason) {
      setSyncNote("");
      setSyncError(message(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  async function runSyncNow() {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncNote("正在同步…");
    setSyncError("");
    try {
      await api.setSyncBaseUrl(syncBaseUrl.trim());
      const result = await api.syncNow();
      const status = await api.syncStatus();
      setSyncLastAt(status.lastSyncAt);
      setSyncSignedIn(status.signedIn);
      window.dispatchEvent(new Event("desk-changed"));
      setSyncNote(`同步完成：推送 ${result.pushed}，接受 ${result.accepted}，拒绝 ${result.rejected}，拉取 ${result.pulled}。`);
    } catch (reason) {
      setSyncNote("");
      setSyncError(message(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  async function runSyncLogout() {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncError("");
    setSyncNote("正在退出…");
    try {
      const status = await api.syncLogout();
      setSyncSignedIn(status.signedIn);
      setSyncNote("已退出云端账号。");
    } catch (reason) {
      setSyncNote("");
      setSyncError(message(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  const mobile = isAndroid();

  const subName = (id: number) => {
    const sub = subs.find((item) => item.id === id);
    if (!sub) return "未知子任务";
    return `${sub.projectName} · ${sub.name}`;
  };

  return (
    <section>
      <h1>设置</h1>
      <p className="lead">
        {mobile
          ? "模型用于关联待办、今日建议和阻塞问询。钥匙存在系统凭据里。"
          : "模型用于待办关联项目、今日三件建议和阻塞问询话术。钥匙放在系统凭据里。"}
      </p>
      <ErrorText text={error} />
      <div className="stack">
        {(!mobile || showAdvancedAi) && (
          <label className="field">接口地址<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        )}
        {mobile && !showAdvancedAi && (
          <button type="button" className="quiet settings-advanced-toggle" onClick={() => setShowAdvancedAi(true)}>
            显示高级接口设置
          </button>
        )}
        <label className="field">模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label className="field">
          API 钥匙
          <input type="password" value={apiKey} placeholder={hasKey ? "已保存，留空则不改" : "还没有"} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <p className="note">{hasKey ? "钥匙已在系统凭据里，这里不再显示原文。留空再保存，不会改掉它。" : "还没有保存过钥匙。"}</p>
        {supportsAutostart && (
          <label className="checks">
            <input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} />
            登录时启动
          </label>
        )}
        <div className={`actions settings-actions${mobile ? " settings-actions-mobile" : ""}`} style={{ justifyContent: "flex-start" }}>
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
            {loadingDemo ? "加载中…" : "重新加载示例数据"}
          </button>
        </div>
        {testing && <AiBusy label="正在检测模型连接" />}
        {note && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{note}</p>}
        {!mobile && <p className="note">数据文件：{dataPath}</p>}
        <p className="note">点「重新加载示例数据」会清空当前业务数据，再写入一套模拟数据。模型地址与钥匙会保留。</p>
        {!mobile && (
          <p className="note">关掉主窗口后程序仍在托盘里。右下角图标可以重新打开，或退出。</p>
        )}
      </div>

      <section className="project-section" style={{ marginTop: 28 }}>
        <div className="section-head">
          <h2>云端同步</h2>
        </div>
        <p className="note">把项目、子任务、待办、进展与灵感便签同步到云端。先登录，再点立即同步。</p>
        <div className="stack">
          {!mobile && (
            <label className="field">同步服务地址<input value={syncBaseUrl} onChange={(event) => setSyncBaseUrl(event.target.value)} /></label>
          )}
          <label className="field">邮箱<input value={syncEmail} onChange={(event) => setSyncEmail(event.target.value)} autoComplete="username" /></label>
          <label className="field">
            密码
            <input
              type="password"
              value={syncPassword}
              placeholder={syncSignedIn ? "已登录，改密/重登时再填" : "至少 8 位"}
              onChange={(event) => setSyncPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <p className="note">
            {syncSignedIn
              ? `已登录${syncEmail ? `：${syncEmail}` : ""}。${syncLastAt ? `上次同步 ${when(syncLastAt)}` : "还没有同步过。"}`
              : "还没有登录云端账号。"}
          </p>
          <ErrorText text={syncError} />
          {syncNote && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{syncNote}</p>}
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            {!syncSignedIn ? (
              <>
                <button type="button" className="primary" disabled={syncBusy} onClick={() => void runSyncAuth("login")}>
                  {syncBusy ? "处理中…" : "登录"}
                </button>
                <button type="button" disabled={syncBusy} onClick={() => void runSyncAuth("register")}>注册</button>
              </>
            ) : (
              <>
                <button type="button" className="primary" disabled={syncBusy} onClick={() => void runSyncNow()}>
                  {syncBusy ? "同步中…" : "立即同步"}
                </button>
                <button type="button" disabled={syncBusy} onClick={() => void runSyncAuth("login")}>重新登录</button>
                <button type="button" className="quiet" disabled={syncBusy} onClick={() => void runSyncLogout()}>退出登录</button>
              </>
            )}
          </div>
        </div>
      </section>

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
