import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, message } from "../api";
import type { NoteNode } from "../types";
import { ErrorText } from "../widgets";

function plainText(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return (root.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char
  ));
}

function textToHtml(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((line) => line.trim())) return "";
  return lines.map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join("");
}

function dateTitle(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

function titleOf(node: NoteNode) {
  const title = node.title.trim();
  if (title) return title;
  return node.kind === "folder" ? "未命名文件夹" : "无标题笔记";
}

export function AndroidNotes({ revision }: { revision: number }) {
  const [nodes, setNodes] = useState<NoteNode[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [composer, setComposer] = useState<null | { id: number | null; title: string; body: string }>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shell, setShell] = useState<Element | null>(null);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [moving, setMoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const editBoot = useRef<number | null>(null);

  useEffect(() => {
    setShell(document.querySelector(".android-app"));
  }, []);

  useEffect(() => {
    let live = true;
    setReady(false);
    void api.listNotes().then((list) => {
      if (!live) return;
      setNodes(list);
      setError("");
      setReady(true);
    }).catch((reason) => {
      if (!live) return;
      setError(message(reason));
      setReady(true);
    });
    return () => { live = false; };
  }, [revision]);

  const folder = folderId == null ? null : nodes.find((node) => node.id === folderId && node.kind === "folder") ?? null;
  const here = nodes.filter((node) => node.parentId === (folder ? folder.id : null));
  const folders = here.filter((node) => node.kind === "folder");
  const notes = here.filter((node) => node.kind === "note");
  const opened = openedId == null ? null : nodes.find((node) => node.id === openedId && node.kind === "note") ?? null;

  useLayoutEffect(() => {
    if (!editing || !opened) {
      editBoot.current = null;
      return;
    }
    if (editBoot.current === opened.id) return;
    const editor = editorRef.current;
    if (!editor) return;
    editBoot.current = opened.id;
    editor.innerHTML = opened.body.trim() ? opened.body : "<p><br></p>";
    editor.focus();
  }, [editing, opened]);

  function remember(saved: NoteNode) {
    setNodes((current) => {
      const rest = current.filter((node) => node.id !== saved.id);
      return [...rest, saved];
    });
  }

  function openComposer() {
    setExpanded(false);
    setFolderDraft(null);
    setMenuOpen(false);
    setComposer({ id: null, title: dateTitle(), body: "" });
  }

  function contains(ancestorId: number, nodeId: number) {
    let parentId = nodes.find((node) => node.id === nodeId)?.parentId ?? null;
    const seen = new Set<number>();
    while (parentId != null && !seen.has(parentId)) {
      if (parentId === ancestorId) return true;
      seen.add(parentId);
      parentId = nodes.find((node) => node.id === parentId)?.parentId ?? null;
    }
    return false;
  }

  function removeTree(ids: number[]) {
    setNodes((current) => {
      const gone = new Set<number>();
      const walk = (id: number) => {
        if (gone.has(id)) return;
        gone.add(id);
        current.filter((node) => node.parentId === id).forEach((node) => walk(node.id));
      };
      ids.forEach(walk);
      return current.filter((node) => !gone.has(node.id));
    });
  }

  function openNote(note: NoteNode) {
    setComposer(null);
    setFolderDraft(null);
    setEditing(false);
    setOpenedId(note.id);
  }

  async function saveComposer() {
    if (!composer || saving) return;
    const title = composer.title.trim();
    const body = composer.body;
    if (!title && !body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const html = textToHtml(body);
      let saved: NoteNode;
      if (composer.id == null) {
        const created = await api.createNote("note", folder?.id ?? null, title);
        saved = html ? await api.saveNote(created.id, title, html) : created;
      } else {
        saved = await api.saveNote(composer.id, title, html);
      }
      remember(saved);
      setComposer(null);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  async function createFolder() {
    if (folderDraft == null || saving) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.createNote("folder", folder?.id ?? null, folderDraft);
      remember(created);
      setFolderDraft(null);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit() {
    if (!opened) return;
    setDraftTitle(opened.title);
    setEditing(true);
  }

  async function saveOpened() {
    if (!opened || saving) return;
    const html = editorRef.current?.innerHTML ?? opened.body;
    setSaving(true);
    setError("");
    try {
      const saved = await api.saveNote(opened.id, draftTitle.trim(), html);
      remember(saved);
      setEditing(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  function openBatch() {
    setMenuOpen(false);
    setComposer(null);
    setFolderDraft(null);
    setPicked([]);
    setMoving(false);
    setBatch(true);
  }

  function togglePicked(id: number) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function deletePicked() {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      for (const id of picked) {
        await api.deleteNote(id);
        removeTree([id]);
      }
      setPicked([]);
      setBatch(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  async function movePicked(parentId: number | null) {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      for (const id of picked) remember(await api.moveNote(id, parentId));
      setPicked([]);
      setMoving(false);
      setBatch(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  async function deleteOpened() {
    if (!opened || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteNote(opened.id);
      removeTree([opened.id]);
      setConfirmDelete(false);
      setEditing(false);
      setOpenedId(null);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  }

  const visible = [...folders, ...notes];
  const allPicked = visible.length > 0 && visible.every((item) => picked.includes(item.id));
  const moveTargets = nodes.filter((node) => (
    node.kind === "folder"
    && node.id !== folder?.id
    && !picked.includes(node.id)
    && !picked.some((id) => contains(id, node.id))
  ));

  return (
    <section className="android-notes">
      <header className="android-notes-head">
        {folder ? (
          <button type="button" className="android-notes-back" onClick={() => setFolderId(folder.parentId)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" /></svg>
            <span>{titleOf(folder)}</span>
          </button>
        ) : (
          <h1>笔记</h1>
        )}
        <div className="android-notes-menu-wrap">
          <button type="button" className="android-notes-more" aria-label="更多" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="6" r="1.45" />
              <circle cx="12" cy="12" r="1.45" />
              <circle cx="12" cy="18" r="1.45" />
            </svg>
          </button>
          {menuOpen ? (
            <>
              <button type="button" className="android-notes-menu-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />
              <div className="android-notes-menu" role="menu">
                <button type="button" role="menuitem" onClick={openBatch}>批量编辑</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setComposer(null); setFolderDraft(""); }}>新建文件夹</button>
              </div>
            </>
          ) : null}
        </div>
      </header>
      <ErrorText text={error} />

      {!ready ? <p className="android-notes-empty">正在读取笔记…</p> : null}
      {ready && folders.length === 0 && notes.length === 0 ? (
        <p className="android-notes-empty">{folder ? "这个文件夹还是空的。" : "还没有笔记。点右下角加号写一条。"}</p>
      ) : null}

      <div className="android-notes-list">
        {folders.map((item) => (
          <button key={item.id} type="button" className="android-note-card is-folder" onClick={() => setFolderId(item.id)}>
            <span className="android-note-folder-icon" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M3.6 8.2V7.1A1.6 1.6 0 0 1 5.2 5.5h3.1l1.5 1.7h8.4a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z" /></svg>
            </span>
            <span className="android-note-card-copy">
              <strong>{titleOf(item)}</strong>
              <em>{stamp(item.updatedAt)}</em>
            </span>
          </button>
        ))}
        {folders.length > 0 && notes.length > 0 ? <div className="android-notes-section">其他</div> : null}
        {notes.map((item) => {
          const snippet = plainText(item.body);
          return (
            <button key={item.id} type="button" className="android-note-card" onClick={() => openNote(item)}>
              <span className="android-note-doc-icon" aria-hidden>
                <svg viewBox="0 0 24 24"><path d="M7 4.2h7l4 4V19a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 19V5.6A1.4 1.4 0 0 1 7 4.2Z" /><path d="M14 4.4V8.4h4" /></svg>
              </span>
              <span className="android-note-card-copy">
                <strong>{titleOf(item)}</strong>
                {snippet ? <span>{snippet}</span> : null}
                <em>{stamp(item.updatedAt)}</em>
              </span>
            </button>
          );
        })}
      </div>

      {composer || opened || folderDraft != null || batch || !shell ? null : createPortal(
        <button type="button" className="android-fab android-notes-fab" aria-label="新建笔记" onClick={() => openComposer()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>,
        shell,
      )}

      {composer ? (
        <div className="android-note-composer-backdrop" onClick={() => { if (!saving) setComposer(null); }}>
          <div
            className={expanded ? "android-note-composer is-expanded" : "android-note-composer"}
            role="dialog"
            aria-modal="true"
            aria-label="新建笔记"
            onClick={(event) => event.stopPropagation()}
          >
            {folder ? <div className="android-note-crumb">{titleOf(folder)} &gt;</div> : null}
            <div className="android-note-composer-title-row">
              <input
                className="android-note-plain"
                value={composer.title}
                placeholder="标题"
                aria-label="标题"
                onChange={(event) => setComposer({ ...composer, title: event.target.value })}
              />
              <button type="button" className="android-note-expand" aria-label={expanded ? "收起" : "展开"} onClick={() => setExpanded((value) => !value)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v4M15 5h4v4M19 15v4h-4M9 19H5v-4" /></svg>
              </button>
            </div>
            <textarea
              className="android-note-plain"
              value={composer.body}
              placeholder="写下内容"
              aria-label="正文"
              onChange={(event) => setComposer({ ...composer, body: event.target.value })}
            />
            <div className="android-note-composer-bar">
              <button
                type="button"
                className="android-note-save"
                disabled={saving || (!composer.title.trim() && !composer.body.trim())}
                onClick={() => void saveComposer()}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderDraft != null ? (
        <div className="android-note-composer-backdrop" onClick={() => { if (!saving) setFolderDraft(null); }}>
          <div className="android-note-composer android-note-folder-sheet" role="dialog" aria-modal="true" aria-label="新建文件夹" onClick={(event) => event.stopPropagation()}>
            <input
              className="android-note-plain"
              value={folderDraft}
              placeholder="文件夹名称"
              aria-label="文件夹名称"
              autoFocus
              onChange={(event) => setFolderDraft(event.target.value)}
            />
            <div className="android-note-composer-bar">
              <button type="button" className="android-note-save" disabled={saving} onClick={() => void createFolder()}>
                {saving ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {opened && shell ? createPortal(
        <section className="android-note-reader" role="dialog" aria-modal="true" aria-label={titleOf(opened)}>
          <header className="android-note-reader-bar">
            {editing ? (
              <button type="button" aria-label="保存" disabled={saving} onClick={() => void saveOpened()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" /></svg>
              </button>
            ) : (
              <button type="button" aria-label="返回" onClick={() => { setOpenedId(null); setEditing(false); setConfirmDelete(false); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" /></svg>
              </button>
            )}
            {editing ? <span /> : (
              <button type="button" aria-label="删除" onClick={() => setConfirmDelete(true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14M9.4 7.4V5.7h5.2v1.7M8 7.5l.7 11.2h6.6L16 7.5" /></svg>
              </button>
            )}
          </header>
          <ErrorText text={error} />
          <div className="android-note-reader-body">
            {editing ? null : <h1 className="android-note-read-title">{opened.title.trim() || "无标题笔记"}</h1>}
            {editing ? (
              <>
                <input
                  className="android-note-plain android-note-reader-title"
                  value={draftTitle}
                  placeholder="标题"
                  aria-label="标题"
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
                <div
                  ref={editorRef}
                  className="android-note-doc"
                  contentEditable
                  role="textbox"
                  aria-label="正文"
                  suppressContentEditableWarning
                />
              </>
            ) : opened.body.trim() ? (
              <div className="android-note-doc" dangerouslySetInnerHTML={{ __html: opened.body }} />
            ) : null}
          </div>
          {confirmDelete ? (
            <div className="android-note-confirm-backdrop" onClick={() => { if (!saving) setConfirmDelete(false); }}>
              <div className="android-note-confirm" role="dialog" aria-modal="true" aria-label="删除笔记" onClick={(event) => event.stopPropagation()}>
                <p>删除这篇笔记？</p>
                <div>
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>取消</button>
                  <button type="button" className="is-danger" onClick={() => void deleteOpened()} disabled={saving}>{saving ? "删除中…" : "删除"}</button>
                </div>
              </div>
            </div>
          ) : null}
          {editing ? null : (
            <button type="button" className="android-note-edit-fab" aria-label="编辑" onClick={beginEdit}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.8V20h3.2L18.4 8.8l-3.2-3.2L4 16.8Z" /><path d="M13.8 7 17 10.2" /></svg>
            </button>
          )}
        </section>,
        shell,
      ) : null}

      {batch && shell ? createPortal(
        <section className="android-note-batch" role="dialog" aria-modal="true" aria-label="批量编辑">
          <header className="android-note-batch-bar">
            <button type="button" className="android-note-batch-all" onClick={() => setPicked(allPicked ? [] : visible.map((item) => item.id))}>全选</button>
            <strong>批量编辑</strong>
            <button type="button" className="android-note-batch-cancel" onClick={() => { setBatch(false); setMoving(false); setPicked([]); }}>取消</button>
          </header>
          <ErrorText text={error} />
          <div className="android-note-batch-list">
            {visible.length === 0 ? <p className="android-notes-empty">这里还没有可以编辑的笔记。</p> : null}
            {folders.map((item) => (
              <button key={item.id} type="button" className="android-note-card" onClick={() => togglePicked(item.id)}>
                <span className={picked.includes(item.id) ? "android-note-check is-on" : "android-note-check"} aria-hidden>
                  {picked.includes(item.id) ? <svg viewBox="0 0 24 24"><path d="M6 12.2 10 16l8-8" /></svg> : null}
                </span>
                <span className="android-note-folder-icon" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M3.6 8.2V7.1A1.6 1.6 0 0 1 5.2 5.5h3.1l1.5 1.7h8.4a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z" /></svg>
                </span>
                <span className="android-note-card-copy">
                  <strong>{titleOf(item)}</strong>
                  <em>{stamp(item.updatedAt)}</em>
                </span>
              </button>
            ))}
            {folders.length > 0 && notes.length > 0 ? <div className="android-notes-section">其他</div> : null}
            {notes.map((item) => {
              const snippet = plainText(item.body);
              const on = picked.includes(item.id);
              return (
                <button key={item.id} type="button" className="android-note-card" onClick={() => togglePicked(item.id)}>
                  <span className={on ? "android-note-check is-on" : "android-note-check"} aria-hidden>
                    {on ? <svg viewBox="0 0 24 24"><path d="M6 12.2 10 16l8-8" /></svg> : null}
                  </span>
                  <span className="android-note-doc-icon" aria-hidden>
                    <svg viewBox="0 0 24 24"><path d="M7 4.2h7l4 4V19a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 19V5.6A1.4 1.4 0 0 1 7 4.2Z" /><path d="M14 4.4V8.4h4" /></svg>
                  </span>
                  <span className="android-note-card-copy">
                    <strong>{titleOf(item)}</strong>
                    {snippet ? <span>{snippet}</span> : null}
                    <em>{stamp(item.updatedAt)}</em>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="android-note-batch-actions">
            <button type="button" className={picked.length ? "android-note-batch-delete is-ready" : "android-note-batch-delete"} disabled={!picked.length || saving} onClick={() => void deletePicked()}>删除</button>
            <button type="button" className="android-note-batch-move" disabled={!picked.length || saving} onClick={() => setMoving(true)}>移动</button>
          </div>
          {moving ? (
            <div className="android-note-composer-backdrop" onClick={() => { if (!saving) setMoving(false); }}>
              <div className="android-note-composer android-note-move-sheet" role="dialog" aria-modal="true" aria-label="移动到" onClick={(event) => event.stopPropagation()}>
                <div className="android-note-move-title">移动到</div>
                <div className="android-note-move-list">
                  <button type="button" onClick={() => void movePicked(null)}>全部笔记</button>
                  {moveTargets.map((item) => (
                    <button key={item.id} type="button" onClick={() => void movePicked(item.id)}>{titleOf(item)}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>,
        shell,
      ) : null}
    </section>
  );
}
