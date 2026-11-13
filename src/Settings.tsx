import { useEffect, useState } from "react";
import { isAndroid } from "./android/platform";
import { api, message } from "./api";
import { AiBusy, ErrorText, showToast, when } from "./widgets";

export function Settings({
  revision,
  onRequestAuth,
}: {
  revision: number;
  onRequestAuth?: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [supportsAutostart, setSupportsAutostart] = useState(true);
  const [autoRemind, setAutoRemind] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncDisplayName, setSyncDisplayName] = useState("");
  const [syncSignedIn, setSyncSignedIn] = useState(false);
  const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [syncError, setSyncError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);

  useEffect(() => {
    void api.settings().then((settings) => {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setHasKey(settings.hasApiKey);
      setAutostart(settings.autostart);
      setSupportsAutostart(settings.supportsAutostart);
      setAutoRemind(settings.autoRemind);
    }).catch((reason) => setError(message(reason)));
    void api.syncStatus().then((status) => {
      setSyncEmail(status.email ?? "");
      setSyncDisplayName(status.displayName ?? "");
      setSyncSignedIn(status.signedIn);
      setSyncLastAt(status.lastSyncAt);
    }).catch((reason) => setError(message(reason)));
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

  function startEditName() {
    setNameDraft(syncDisplayName);
    setEditingName(true);
    setSyncError("");
    setSyncNote("");
  }

  async function saveDisplayName() {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncNote("正在保存用户名…");
    setSyncError("");
    try {
      const status = await api.syncSetDisplayName(nameDraft.trim());
      setSyncDisplayName(status.displayName ?? "");
      setSyncEmail(status.email ?? syncEmail);
      setSyncSignedIn(status.signedIn);
      setEditingName(false);
      setSyncNote("用户名已保存。");
      window.dispatchEvent(new Event("desk-changed"));
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
    setSyncNote("");
    setSyncError("");
    try {
      const result = await api.syncNow();
      const status = await api.syncStatus();
      setSyncLastAt(status.lastSyncAt);
      setSyncSignedIn(status.signedIn);
      setSyncDisplayName(status.displayName ?? "");
      window.dispatchEvent(new Event("desk-changed"));
      showToast(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}`);
    } catch (reason) {
      const text = message(reason);
      setSyncError(text);
      showToast(text, "error");
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
      setSyncDisplayName(status.displayName ?? "");
      setEditingName(false);
      setSyncNote("已退出云端账号。");
      window.dispatchEvent(new Event("desk-changed"));
    } catch (reason) {
      setSyncNote("");
      setSyncError(message(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  const mobile = isAndroid();

  return (
    <section>
      <h1>设置</h1>
      <p className="lead">
        {mobile
          ? "模型用于关联待办、今日建议和阻塞问询。钥匙存在系统凭据里。"
          : "模型用于待办关联项目、今日三件建议和阻塞问询话术。钥匙放在系统凭据里。"}
      </p>
      <ErrorText text={error} />

      <section className="settings-panel settings-panel-account">
        <div className="section-head">
          <h2>账号</h2>
        </div>
        {syncSignedIn ? (
          <div className="stack">
            <div className="settings-account-meta">
              <div className="settings-account-row">
                <span className="settings-account-key">邮箱</span>
                <span className="settings-account-value">{syncEmail || "—"}</span>
              </div>
              <div className="settings-account-row">
                <span className="settings-account-key">用户名</span>
                {editingName ? (
                  <div className="settings-account-edit">
                    <input
                      value={nameDraft}
                      placeholder="不校验唯一，可随便起"
                      onChange={(event) => setNameDraft(event.target.value)}
                      autoComplete="nickname"
                      autoFocus
                    />
                    <button type="button" className="primary" disabled={syncBusy} onClick={() => void saveDisplayName()}>
                      保存
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      disabled={syncBusy}
                      onClick={() => { setEditingName(false); setSyncError(""); setSyncNote(""); }}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <span className="settings-account-value-row">
                    <span className={`settings-account-value${syncDisplayName.trim() ? "" : " is-empty"}`}>
                      {syncDisplayName.trim() || "未设置"}
                    </span>
                    <button type="button" className="quiet settings-account-edit-btn" onClick={startEditName}>
                      修改
                    </button>
                  </span>
                )}
              </div>
              <p className="note">
                {syncLastAt ? `上次同步 ${when(syncLastAt)}` : "还没有同步过"}
              </p>
            </div>
            <ErrorText text={syncError} />
            {syncNote && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{syncNote}</p>}
            <div className="actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="quiet" disabled={syncBusy} onClick={() => void runSyncLogout()}>
                退出登录
              </button>
              <button type="button" className="primary" disabled={syncBusy} onClick={() => void runSyncNow()}>
                {syncBusy ? "同步中…" : "同步数据"}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="note">还没有登录云端账号。登录后可同步项目、待办和笔记。</p>
            <ErrorText text={syncError} />
            {syncNote && <p className="note">{syncNote}</p>}
            {onRequestAuth && (
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button type="button" className="primary" onClick={onRequestAuth}>去登录</button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="settings-panel settings-panel-prefs">
        <div className="section-head">
          <h2>启动与提醒</h2>
        </div>
        <div className="stack">
          {supportsAutostart && (
            <>
              <label className="checks">
                <input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} />
                开机后自动启动
              </label>
              <p className="note">勾选后，你登录电脑（开机进入桌面）时会自动打开本应用。</p>
            </>
          )}
          <label className="checks">
            <input type="checkbox" checked={autoRemind} onChange={(event) => setAutoRemind(event.target.checked)} />
            自动提醒
          </label>
          <p className="note">关闭后，程序不会自动弹出到点提醒。</p>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="primary"
              onClick={() => void api.saveSettings({
                baseUrl,
                model,
                apiKey: null,
                clearApiKey: false,
                autostart,
                autoRemind,
              }).then((settings) => {
                setAutostart(settings.autostart);
                setAutoRemind(settings.autoRemind);
                setError("");
                showToast("启动与提醒已保存");
              }).catch((reason) => setError(message(reason)))}
            >
              保存
            </button>
          </div>
        </div>
      </section>

      <section className="settings-panel settings-panel-model">
        <div className="section-head">
          <h2>模型</h2>
        </div>
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
          <div className={`actions settings-actions${mobile ? " settings-actions-mobile" : ""}`} style={{ justifyContent: "flex-start" }}>
            <button className="primary" onClick={() => void api.saveSettings({
              baseUrl,
              model,
              apiKey: apiKey.trim() ? apiKey : null,
              clearApiKey: false,
              autostart,
              autoRemind,
            }).then((settings) => {
              setHasKey(settings.hasApiKey);
              setAutoRemind(settings.autoRemind);
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
              baseUrl, model, apiKey: null, clearApiKey: true, autostart, autoRemind,
            }).then((settings) => {
              setHasKey(settings.hasApiKey);
              setNote("已清除钥匙。");
            }).catch((reason) => setError(message(reason)))}>清除钥匙</button>}
          </div>
          {testing && <AiBusy label="正在检测模型连接" />}
          {note && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{note}</p>}
        </div>
      </section>
    </section>
  );
}
