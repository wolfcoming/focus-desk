import { useEffect, useState } from "react";
import { api, message } from "./api";
import { ErrorText } from "./widgets";

type Mode = "login" | "register";

export function Auth({
  revision,
  onDone,
  onOpenSettings,
}: {
  revision: number;
  onDone?: () => void;
  onOpenSettings?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api.syncStatus().then((status) => {
      setEmail(status.email ?? "");
      setSignedIn(status.signedIn);
      setAccountEmail(status.email ?? "");
      setAccountName(status.displayName ?? "");
      if (status.displayName) setDisplayName(status.displayName);
    }).catch((reason) => setError(message(reason)));
  }, [revision]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setNote(mode === "login" ? "正在登录…" : "正在注册…");
    setError("");
    try {
      const status = mode === "login"
        ? await api.syncLogin(email.trim(), password)
        : await api.syncRegister(email.trim(), password, displayName.trim() || null);
      setSignedIn(status.signedIn);
      setAccountEmail(status.email ?? email.trim());
      setAccountName(status.displayName ?? displayName.trim());
      setPassword("");
      setNote(mode === "login" ? "已登录。" : "已注册并登录。");
      window.dispatchEvent(new Event("desk-changed"));
      onDone?.();
    } catch (reason) {
      setNote("");
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("正在退出…");
    try {
      const status = await api.syncLogout();
      setSignedIn(status.signedIn);
      setAccountName(status.displayName ?? "");
      setAccountEmail(status.email ?? "");
      setNote("已退出。");
      window.dispatchEvent(new Event("desk-changed"));
    } catch (reason) {
      setNote("");
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  if (signedIn) {
    return (
      <section className="auth-page">
        <h1>账号</h1>
        <p className="lead">你已登录云端账号。</p>
        <ErrorText text={error} />
        <div className="stack auth-card">
          <p className="auth-identity">
            <strong>{accountName || accountEmail || "已登录"}</strong>
            {accountName && accountEmail ? <span>{accountEmail}</span> : null}
          </p>
          {note && <p className="note">{note}</p>}
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            {onOpenSettings && (
              <button type="button" className="primary" onClick={onOpenSettings}>查看设置</button>
            )}
            <button type="button" className="quiet" disabled={busy} onClick={() => void logout()}>
              {busy ? "处理中…" : "退出登录"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <h1>{mode === "login" ? "登录" : "注册"}</h1>
      <p className="lead">登录后可同步项目、待办与进展。</p>
      <ErrorText text={error} />
      <div className="stack auth-card">
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode("login"); setError(""); setNote(""); }}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => { setMode("register"); setError(""); setNote(""); }}
          >
            注册
          </button>
        </div>
        {mode === "register" && (
          <label className="field">
            用户名（可选）
            <input
              value={displayName}
              placeholder="不校验唯一，可随时修改"
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
            />
          </label>
        )}
        <label className="field">
          邮箱
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            inputMode="email"
          />
        </label>
        <label className="field">
          密码
          <input
            type="password"
            value={password}
            placeholder="至少 8 位"
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {note && <p className="note">{note}</p>}
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </div>
      </div>
    </section>
  );
}
