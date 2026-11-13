import { useEffect, useState } from "react";
import { api, message } from "../api";
import { ThemeToggle } from "../ThemeToggle";
import { showToast } from "../widgets";

export function More({
  revision,
  onOpenSettings,
  onOpenAuth,
}: {
  revision: number;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    void api.syncStatus().then((status) => {
      setSignedIn(status.signedIn);
      setEmail(status.email ?? "");
      setDisplayName(status.displayName?.trim() || "");
    }).catch((reason) => setError(message(reason)));
  }, [revision]);

  const title = signedIn ? (displayName || "未设置用户名") : "未登录";
  const subtitle = signedIn
    ? (email || "已登录")
    : "登录后可同步项目与待办";
  const avatarText = signedIn
    ? (displayName || email || "?").trim().slice(0, 1).toUpperCase()
    : "我";

  async function runSync() {
    if (syncBusy || !signedIn) return;
    setSyncBusy(true);
    setError("");
    try {
      const result = await api.syncNow();
      window.dispatchEvent(new Event("desk-changed"));
      showToast(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}`);
    } catch (reason) {
      const text = message(reason);
      setError(text);
      showToast(text, "error");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <section className="android-more android-mine">
      <header className="android-page-head android-mine-head">
        <div className="android-page-head-copy">
          <h1>我的</h1>
        </div>
      </header>

      <button
        type="button"
        className="android-mine-profile"
        onClick={() => (signedIn ? onOpenSettings() : onOpenAuth())}
      >
        <span className="android-mine-avatar" aria-hidden="true">{avatarText}</span>
        <span className="android-mine-profile-copy">
          <strong className={signedIn && !displayName ? "is-empty" : undefined}>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <span className="android-mine-chevron" aria-hidden="true">›</span>
      </button>

      {error ? <p className="note">{error}</p> : null}

      <div className="android-list android-mine-list">
        {signedIn && (
          <button
            type="button"
            className="android-list-item"
            disabled={syncBusy}
            onClick={() => void runSync()}
          >
            <span className="android-list-title">{syncBusy ? "同步中…" : "同步数据"}</span>
            <span className="android-list-sub">把本地改动与云端互相更新</span>
          </button>
        )}
        <ThemeToggle variant="row" />
        <button
          type="button"
          className="android-list-item"
          onClick={onOpenSettings}
        >
          <span className="android-list-title">设置</span>
          <span className="android-list-sub">账号、启动提醒与模型</span>
        </button>
      </div>
    </section>
  );
}
