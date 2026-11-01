import { useEffect, useState } from "react";
import { api, message } from "./api";
import { ErrorText } from "./widgets";

export function Settings({ revision }: { revision: number }) {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [autostart, setAutostart] = useState(true);
  const [dataPath, setDataPath] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api.settings().then((settings) => {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setHasKey(settings.hasApiKey);
      setAutostart(settings.autostart);
      setDataPath(settings.dataPath);
    }).catch((reason) => setError(message(reason)));
  }, [revision]);

  return (
    <section>
      <h1>设置</h1>
      <p className="lead">模型只在整理收集箱、今日三件和对上「我正在做的事」时调用。切换结论仍由规则给出。钥匙放在系统凭据里。</p>
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
          {hasKey && <button className="quiet" onClick={() => void api.saveSettings({
            baseUrl, model, apiKey: null, clearApiKey: true, autostart,
          }).then((settings) => {
            setHasKey(settings.hasApiKey);
            setNote("已清除钥匙。");
          }).catch((reason) => setError(message(reason)))}>清除钥匙</button>}
          <button onClick={() => void api.checkReminders().then((reminder) => {
            setNote(reminder ? `已弹出：${reminder.title}` : "现在没有到点的提醒。");
          }).catch((reason) => setError(message(reason)))}>立即检查提醒</button>
        </div>
        {note && <p className="note">{note}</p>}
        <p className="note">数据文件：{dataPath}</p>
        <p className="note">关掉主窗口后程序仍在托盘里。右下角图标可以重新打开，或退出。</p>
      </div>
    </section>
  );
}
