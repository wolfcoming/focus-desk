import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { api, message } from "./api";
import type { NoteNode } from "./types";
import { showToast } from "./widgets";

type Draft = { id: number; title: string; body: string; dirty: boolean };
type View = "all" | "recent" | "starred";
type SaveState = "saved" | "dirty" | "saving" | "error";
type MenuState =
  | { kind: "new"; x: number; y: number }
  | { kind: "node"; x: number; y: number; id: number }
  | null;
type DialogState =
  | { kind: "delete"; id: number }
  | { kind: "move"; id: number }
  | null;

const SELECT_KEY = "focus-desk.notes.selected";
const EXPAND_KEY = "focus-desk.notes.expanded";
const VIEW_KEY = "focus-desk.notes.view";
const TREE_KEY = "focus-desk.notes.tree";
const MAX_IMAGE = Math.floor(1.5 * 1024 * 1024);
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const modLabel = isMac ? "⌘" : "Ctrl+";

const TEXT_COLORS = ["#2a3640", "#9b3b2a", "#b45309", "#3f5f6c", "#2f6f4e", "#6b4c9a"];
const MARK_COLORS = [
  { value: "#fff3bf", label: "淡黄" },
  { value: "#d8f5e4", label: "薄荷" },
  { value: "#d7ebf8", label: "浅蓝" },
  { value: "#ffd9e2", label: "浅玫" },
  { value: "#efe4ff", label: "浅紫" },
  { value: "#ffffff", label: "无" },
];

function plainText(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return (root.textContent ?? "").replace(/\u00a0/g, " ");
}

function wordCount(text: string) {
  return [...text.replace(/\s/g, "")].length;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char
  ));
}

function sanitize(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const drop = new Set(["SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM"]);
  const remove: Element[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    if (drop.has(el.tagName)) {
      remove.push(el);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  for (const el of remove) el.remove();
  return root.innerHTML;
}

function safeUrl(raw: string) {
  const url = raw.trim();
  if (!url || /^\s*javascript:/i.test(url)) return null;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(url)) return `https://${url}`;
  return null;
}

function formatDate(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date);
}

function compareNodes(a: NoteNode, b: NoteNode) {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id - b.id;
}

function childrenOf(nodes: NoteNode[], parentId: number | null) {
  return nodes.filter((node) => node.parentId === parentId).sort(compareNodes);
}

function pathOf(nodes: NoteNode[], id: number) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: NoteNode[] = [];
  const seen = new Set<number>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function descendantIds(nodes: NoteNode[], id: number) {
  const out: number[] = [];
  const walk = (parentId: number) => {
    for (const node of nodes) {
      if (node.parentId !== parentId) continue;
      out.push(node.id);
      walk(node.id);
    }
  };
  walk(id);
  return out;
}

function shownTitle(node: NoteNode, draft: Draft | null) {
  const raw = draft?.id === node.id ? draft.title : node.title;
  const title = raw.trim();
  if (title) return title;
  return node.kind === "folder" ? "未命名文件夹" : "无标题笔记";
}

function nextFolderName(nodes: NoteNode[], parentId: number | null) {
  const names = new Set(
    nodes.filter((node) => node.parentId === parentId && node.kind === "folder").map((node) => node.title),
  );
  if (!names.has("新建文件夹")) return "新建文件夹";
  let index = 2;
  while (names.has(`新建文件夹 ${index}`)) index += 1;
  return `新建文件夹 ${index}`;
}

function readView(): View {
  const value = localStorage.getItem(VIEW_KEY);
  return value === "recent" || value === "starred" ? value : "all";
}

function menuPosition(x: number, y: number) {
  const width = 210;
  const height = 300;
  return {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

function snippet(text: string, query: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const q = query.trim();
  const index = q ? clean.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return clean.slice(0, 42);
  const start = Math.max(0, index - 10);
  const end = Math.min(clean.length, index + q.length + 22);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

export function Notes() {
  const [nodes, setNodes] = useState<NoteNode[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusFolderId, setFocusFolderId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [rename, setRename] = useState<{ id: number; value: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_KEY) !== "0");

  const nodesRef = useRef(nodes);
  const draftRef = useRef(draft);
  const focusFolderRef = useRef(focusFolderId);
  const readyRef = useRef(false);
  const deletedRef = useRef(new Set<number>());
  const editToken = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const flushPromise = useRef<Promise<boolean> | null>(null);
  const renameLock = useRef(false);
  const cancelRename = useRef(false);
  const dragging = useRef<number | null>(null);
  const busy = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  nodesRef.current = nodes;
  draftRef.current = draft;
  focusFolderRef.current = focusFolderId;

  function replaceNode(saved: NoteNode) {
    nodesRef.current = nodesRef.current.map((node) => (node.id === saved.id ? saved : node));
    setNodes(nodesRef.current);
  }

  async function doFlush() {
    const current = draftRef.current;
    if (!current?.dirty) return true;
    if (deletedRef.current.has(current.id)) {
      draftRef.current = { ...current, dirty: false };
      return true;
    }
    const token = editToken.current;
    const snapshot = { id: current.id, title: current.title, body: current.body };
    setSaveState("saving");
    try {
      const saved = await api.saveNote(snapshot.id, snapshot.title, sanitize(snapshot.body));
      if (!deletedRef.current.has(snapshot.id)) replaceNode(saved);
      const still = draftRef.current;
      if (still && still.id === snapshot.id && editToken.current === token) {
        const clean = { ...still, dirty: false };
        draftRef.current = clean;
        setDraft(clean);
        setSaveState("saved");
      } else if (still?.id === snapshot.id) {
        setSaveState("dirty");
      } else {
        setSaveState("saved");
      }
      return true;
    } catch (err) {
      if (deletedRef.current.has(snapshot.id) || message(err).includes("不存在")) return true;
      setSaveState("error");
      showToast(message(err), "error");
      return false;
    }
  }

  function startFlush() {
    if (flushPromise.current) return flushPromise.current;
    const run = doFlush().finally(() => {
      flushPromise.current = null;
    });
    flushPromise.current = run;
    return run;
  }

  async function flushAll() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    for (let attempt = 0; attempt < 4 && draftRef.current?.dirty; attempt += 1) {
      const ok = await startFlush();
      if (!ok) return;
    }
  }

  const flushAllRef = useRef(flushAll);
  flushAllRef.current = flushAll;

  function updateDraft(partial: Partial<Pick<Draft, "title" | "body">>) {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...partial, dirty: true };
    if (next.title === current.title && next.body === current.body) return;
    draftRef.current = next;
    setDraft(next);
    editToken.current += 1;
    setSaveState("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushAllRef.current(); }, 450);
  }

  useEffect(() => {
    let live = true;
    void api.listNotes().then((list) => {
      if (!live) return;
      nodesRef.current = list;
      setNodes(list);
      const storedExpanded = localStorage.getItem(EXPAND_KEY);
      if (storedExpanded == null) {
        setExpanded(new Set(list.filter((node) => node.kind === "folder").map((node) => node.id)));
      } else {
        try {
          const parsed = JSON.parse(storedExpanded) as unknown;
          const ids = Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
          setExpanded(new Set(ids));
        } catch {
          setExpanded(new Set());
        }
      }
      const savedId = Number(localStorage.getItem(SELECT_KEY));
      const saved = list.find((node) => node.id === savedId && node.kind === "note");
      const latest = list
        .filter((node) => node.kind === "note")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const initial = saved ?? latest ?? null;
      if (initial) {
        const next = { id: initial.id, title: initial.title, body: initial.body, dirty: false };
        draftRef.current = next;
        setDraft(next);
        setSelectedId(initial.id);
        setHighlightId(initial.id);
        setFocusFolderId(initial.parentId);
      }
      readyRef.current = true;
      setReady(true);
    }).catch((err) => {
      if (!live) return;
      setLoadError(message(err));
      readyRef.current = true;
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(EXPAND_KEY, JSON.stringify([...expanded]));
  }, [expanded, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(VIEW_KEY, view);
  }, [view, ready]);

  useEffect(() => {
    if (!ready || selectedId == null) return;
    localStorage.setItem(SELECT_KEY, String(selectedId));
  }, [selectedId, ready]);

  useEffect(() => {
    localStorage.setItem(TREE_KEY, treeOpen ? "1" : "0");
  }, [treeOpen]);

  useEffect(() => () => { void flushAllRef.current(); }, []);

  useEffect(() => {
    const save = () => { void flushAllRef.current(); };
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (document.querySelector(".notes-modal")) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      void createNode(event.shiftKey ? "folder" : "note");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: globalThis.PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function reveal(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const node of pathOf(nodesRef.current, id)) {
        if (node.kind === "folder") next.add(node.id);
      }
      return next;
    });
  }

  async function openNote(id: number) {
    setHighlightId(id);
    if (draftRef.current?.id === id) return;
    await flushAll();
    const note = nodesRef.current.find((node) => node.id === id && node.kind === "note");
    if (!note) return;
    const next = { id: note.id, title: note.title, body: note.body, dirty: false };
    draftRef.current = next;
    setDraft(next);
    setSelectedId(note.id);
    setFocusFolderId(note.parentId);
    focusFolderRef.current = note.parentId;
    setJustCreatedId(null);
    reveal(note.id);
    setMenu(null);
  }

  async function createNode(kind: "note" | "folder", parentId: number | null = focusFolderRef.current) {
    if (!readyRef.current || busy.current) return;
    busy.current = true;
    try {
      await flushAll();
      if (parentId != null && !nodesRef.current.some((node) => node.id === parentId && node.kind === "folder")) {
        parentId = null;
      }
      const title = kind === "folder" ? nextFolderName(nodesRef.current, parentId) : "";
      const created = await api.createNote(kind, parentId, title);
      nodesRef.current = [...nodesRef.current, created];
      setNodes(nodesRef.current);
      setFocusFolderId(parentId);
      focusFolderRef.current = parentId;
      if (parentId != null) {
        const folderId = parentId;
        setExpanded((prev) => new Set(prev).add(folderId));
      }
      setView("all");
      setQuery("");
      if (kind === "note") {
        const next = { id: created.id, title: created.title, body: "", dirty: false };
        draftRef.current = next;
        setDraft(next);
        setSelectedId(created.id);
        setHighlightId(created.id);
        setJustCreatedId(created.id);
        reveal(created.id);
      } else {
        setHighlightId(created.id);
        setRename({ id: created.id, value: created.title });
        reveal(created.id);
      }
      setMenu(null);
    } catch (err) {
      showToast(message(err), "error");
    } finally {
      busy.current = false;
    }
  }

  async function commitRename() {
    if (renameLock.current || !rename) return;
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const current = rename;
    const node = nodesRef.current.find((item) => item.id === current.id);
    const title = current.value.trim();
    if (!node || node.title === title) {
      setRename(null);
      return;
    }
    renameLock.current = true;
    try {
      if (node.kind === "note" && draftRef.current?.id === node.id) {
        updateDraft({ title });
      } else if (node.kind === "note") {
        const saved = await api.renameNote(node.id, title);
        replaceNode(saved);
      } else {
        const saved = await api.renameNote(node.id, title || "新建文件夹");
        replaceNode(saved);
      }
      setRename(null);
    } catch (err) {
      showToast(message(err), "error");
      setRename(null);
    } finally {
      renameLock.current = false;
    }
  }

  async function toggleFlag(id: number, field: "starred" | "pinned") {
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node) return;
    try {
      const saved = field === "starred"
        ? await api.setNoteStarred(id, !node.starred)
        : await api.setNotePinned(id, !node.pinned);
      replaceNode(saved);
    } catch (err) {
      showToast(message(err), "error");
    }
  }

  async function moveNode(id: number, parentId: number | null) {
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node || node.parentId === parentId) {
      setDialog(null);
      return;
    }
    try {
      const saved = await api.moveNote(id, parentId);
      replaceNode(saved);
      if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId));
      if (draftRef.current?.id === saved.id) {
        setFocusFolderId(saved.parentId);
        focusFolderRef.current = saved.parentId;
      }
      setDialog(null);
      reveal(saved.id);
    } catch (err) {
      showToast(message(err), "error");
    }
  }

  async function deleteNode(id: number) {
    const doomed = new Set([id, ...descendantIds(nodesRef.current, id)]);
    for (const doomedId of doomed) deletedRef.current.add(doomedId);
    if (draftRef.current && doomed.has(draftRef.current.id)) {
      draftRef.current = { ...draftRef.current, dirty: false };
      setDraft(null);
      setSelectedId(null);
    }
    setHighlightId((current) => (current != null && doomed.has(current) ? null : current));
    try {
      await api.deleteNote(id);
      nodesRef.current = nodesRef.current.filter((node) => !doomed.has(node.id));
      setNodes(nodesRef.current);
      if (focusFolderId != null && doomed.has(focusFolderId)) {
        setFocusFolderId(null);
        focusFolderRef.current = null;
      }
      setDialog(null);
    } catch (err) {
      showToast(message(err), "error");
    }
  }

  function canDrop(parentId: number | null) {
    const id = dragging.current;
    if (id == null) return false;
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node || node.parentId === parentId) return false;
    if (parentId == null) return true;
    if (parentId === id || descendantIds(nodesRef.current, id).includes(parentId)) return false;
    return nodesRef.current.some((item) => item.id === parentId && item.kind === "folder");
  }

  function toggleFolder(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusFolderId(id);
    focusFolderRef.current = id;
    setHighlightId(id);
  }

  const noteCount = nodes.filter((node) => node.kind === "note").length;
  const selected = draft ? nodes.find((node) => node.id === draft.id) ?? null : null;
  const q = query.trim();
  const searching = q.length > 0;
  const results = searching
    ? nodes.filter((node) => {
        const title = shownTitle(node, draft).toLowerCase();
        const body = plainText(draft?.id === node.id ? draft.body : node.body).toLowerCase();
        return title.includes(q.toLowerCase()) || (node.kind === "note" && body.includes(q.toLowerCase()));
      })
    : [];
  const recent = nodes
    .filter((node) => node.kind === "note")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const starred = [...nodes.filter((node) => node.starred && node.kind === "folder").sort(compareNodes), ...recent.filter((node) => node.starred)];
  const focusFolder = focusFolderId == null ? null : nodes.find((node) => node.id === focusFolderId && node.kind === "folder") ?? null;

  function renderRows(parentId: number | null, depth: number): ReactNode {
    return childrenOf(nodes, parentId).map((node) => {
      const title = shownTitle(node, draft);
      const open = node.kind === "folder" && expanded.has(node.id);
      const renaming = rename?.id === node.id;
      return (
        <div key={node.id} className="note-branch">
          <div
            role="treeitem"
            aria-selected={node.id === highlightId}
            aria-expanded={node.kind === "folder" ? open : undefined}
            tabIndex={0}
            data-note-id={node.id}
            className={[
              "note-row",
              node.starred ? "has-star" : "",
              node.id === highlightId ? "is-selected" : "",
              dropTarget === node.id ? "is-drop" : "",
            ].filter(Boolean).join(" ")}
            style={{ paddingLeft: depth === 0 ? 4 : 8 }}
            draggable={!renaming}
            onClick={() => {
              if (node.kind === "folder") toggleFolder(node.id);
              else void openNote(node.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setRename({ id: node.id, value: draft?.id === node.id ? draft.title : node.title });
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (node.kind === "folder") toggleFolder(node.id);
                else void openNote(node.id);
              }
            }}
            onDragStart={(event) => {
              dragging.current = node.id;
              event.dataTransfer.setData("text/plain", String(node.id));
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              dragging.current = null;
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (node.kind !== "folder" || !canDrop(node.id)) return;
              event.preventDefault();
              setDropTarget(node.id);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setDropTarget((current) => (current === node.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = dragging.current;
              setDropTarget(null);
              if (id != null && node.kind === "folder") void moveNode(id, node.id);
            }}
          >
            {node.kind === "folder" ? <Chevron open={open} /> : <span className="note-chevron-spacer" aria-hidden />}
            {node.kind === "folder" ? <FolderGlyph /> : <NoteGlyph />}
            {renaming ? (
              <input
                className="note-rename"
                value={rename.value}
                autoFocus
                aria-label="重命名"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onChange={(event) => setRename({ id: node.id, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename.current = true;
                    setRename(null);
                  }
                }}
                onBlur={() => { void commitRename(); }}
              />
            ) : (
              <span className="note-row-name">{title}</span>
            )}
            {node.pinned ? <PinGlyph /> : null}
            <span className="note-row-actions">
              <button
                type="button"
                className={node.starred ? "note-icon-btn is-on" : "note-icon-btn"}
                aria-label={node.starred ? "取消收藏" : "收藏"}
                title={node.starred ? "取消收藏" : "收藏"}
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleFlag(node.id, "starred");
                }}
              >
                <StarGlyph filled={node.starred} />
              </button>
              <button
                type="button"
                className="note-icon-btn"
                aria-label="更多"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ kind: "node", id: node.id, x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <MoreGlyph />
              </button>
            </span>
          </div>
          {open ? <div className="note-children">{renderRows(node.id, depth + 1)}</div> : null}
        </div>
      );
    });
  }

  function renderFlat(list: NoteNode[], empty: string) {
    if (!list.length) return <p className="notes-empty">{empty}</p>;
    return list.map((node) => (
      <button
        key={node.id}
        type="button"
        className={node.id === selectedId ? "note-flat is-selected" : "note-flat"}
        onClick={() => {
          if (node.kind === "folder") {
            setView("all");
            toggleFolder(node.id);
            reveal(node.id);
            return;
          }
          void openNote(node.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
        }}
      >
        <span className="note-flat-title">
          {node.kind === "folder" ? <FolderGlyph /> : <NoteGlyph />}
          <strong>{shownTitle(node, draft)}</strong>
          {node.starred ? <StarGlyph filled /> : null}
        </span>
        <span className="note-flat-meta">
          {node.kind === "note" ? folderLabel(nodes, node.parentId) : "文件夹"}
          <span>·</span>
          {formatStamp(node.updatedAt)}
        </span>
      </button>
    ));
  }

  const menuNode = menu?.kind === "node" ? nodes.find((node) => node.id === menu.id) ?? null : null;

  return (
    <div className={treeOpen ? "notes-app" : "notes-app is-tree-collapsed"}>
      {treeOpen ? <aside className="notes-side">
        <div className="notes-side-head">
          <div className="notes-side-title">
            <span>目录</span>
            <button type="button" className="note-icon-btn" aria-label="收起目录" title="收起目录" onClick={() => setTreeOpen(false)}>
              <PanelChevron direction="left" />
            </button>
          </div>
          <input
            className="notes-search"
            value={query}
            placeholder="搜索笔记"
            aria-label="搜索笔记"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="notes-new">
            <button
              type="button"
              className="primary notes-new-main"
              disabled={!ready}
              title={focusFolder ? `在「${shownTitle(focusFolder, null)}」中新建` : "在全部笔记中新建"}
              onClick={() => void createNode("note")}
            >
              + 新建
            </button>
            <button
              type="button"
              className="primary notes-new-more"
              aria-label="选择新建类型"
              disabled={!ready}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu((current) => current?.kind === "new" ? null : { kind: "new", x: rect.left, y: rect.bottom + 6 });
              }}
            >
              ▾
            </button>
          </div>
          <div className="notes-views" role="tablist" aria-label="笔记视图">
            {(["all", "recent", "starred"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item && !searching}
                className={view === item && !searching ? "active" : ""}
                onClick={() => { setView(item); setQuery(""); }}
              >
                {item === "all" ? "全部" : item === "recent" ? "最新" : "收藏"}
              </button>
            ))}
          </div>
        </div>
        <div className="notes-tree-scroll">
          {loadError ? (
            <div className="notes-empty">
              <p>{loadError}</p>
              <button type="button" onClick={() => window.location.reload()}>重试</button>
            </div>
          ) : !ready ? (
            <p className="notes-empty">正在读取笔记…</p>
          ) : searching ? (
            results.length ? (
              <div className="notes-results">
                {results.map((node) => {
                  const title = shownTitle(node, draft);
                  const body = plainText(draft?.id === node.id ? draft.body : node.body);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={node.id === selectedId ? "note-flat is-selected" : "note-flat"}
                      onClick={() => {
                        if (node.kind === "folder") {
                          setQuery("");
                          setView("all");
                          toggleFolder(node.id);
                          reveal(node.id);
                          return;
                        }
                        void openNote(node.id);
                      }}
                    >
                      <span className="note-flat-title">
                        {node.kind === "folder" ? <FolderGlyph /> : <NoteGlyph />}
                        <strong>{highlight(title, q)}</strong>
                      </span>
                      <span className="note-flat-meta">
                        {node.kind === "note" ? highlight(snippet(body, q) || folderLabel(nodes, node.parentId), q) : "文件夹"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="notes-empty">没有找到相关笔记</p>
          ) : view === "recent" ? (
            renderFlat(recent, "还没有笔记")
          ) : view === "starred" ? (
            renderFlat(starred, "还没有收藏。点笔记上的星标即可收进这里。")
          ) : (
            <div role="tree" aria-label="全部笔记">
              <div
                className={dropTarget === "root" ? "notes-root is-drop" : "notes-root"}
                onDragOver={(event) => {
                  if (!canDrop(null)) return;
                  event.preventDefault();
                  setDropTarget("root");
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setDropTarget((current) => (current === "root" ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = dragging.current;
                  setDropTarget(null);
                  if (id != null) void moveNode(id, null);
                }}
              >
                <button type="button" className="notes-root-btn" onClick={() => { setFocusFolderId(null); focusFolderRef.current = null; setHighlightId(null); }}>
                  <FolderGlyph />
                  <span>全部笔记</span>
                  <em>{noteCount}</em>
                </button>
              </div>
              {nodes.length ? renderRows(null, 0) : <p className="notes-empty">还没有笔记。点「新建」开始记录。</p>}
            </div>
          )}
        </div>
      </aside> : null}
      <section className={treeOpen ? "notes-editor" : "notes-editor is-tree-collapsed"}>
        {treeOpen ? null : (
          <button type="button" className="notes-tree-expand" aria-label="展开目录" title="展开目录" onClick={() => setTreeOpen(true)}>
            <PanelChevron direction="right" />
            <span>目录</span>
          </button>
        )}
        {draft && selected?.kind === "note" ? (
          <NoteEditor
            key={draft.id}
            title={draft.title}
            initialBody={draft.body}
            updatedAt={selected.updatedAt}
            saveState={saveState}
            focusTitle={justCreatedId === draft.id}
            starred={selected.starred}
            path={pathOf(nodes, selected.id).filter((node) => node.kind === "folder")}
            onTitle={(title) => updateDraft({ title })}
            onBody={(body) => updateDraft({ body })}
            onFlush={() => { void flushAll(); }}
            onStar={() => { void toggleFlag(selected.id, "starred"); }}
            onOpenFolder={(id) => {
              setView("all");
              setQuery("");
              if (id < 0) {
                setFocusFolderId(null);
                focusFolderRef.current = null;
                setHighlightId(null);
                return;
              }
              setExpanded((prev) => new Set(prev).add(id));
              setFocusFolderId(id);
              focusFolderRef.current = id;
              setHighlightId(id);
              reveal(id);
              document.querySelector(`[data-note-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
            }}
            onMenu={(x, y) => setMenu({ kind: "node", id: selected.id, x, y })}
            onFocused={() => setJustCreatedId((current) => (current === draft.id ? null : current))}
          />
        ) : (
          <div className="notes-blank">
            <h1>笔记</h1>
            <p>像有道云笔记一样，用文件夹收纳，在右侧直接写。支持标题、列表、待办、引用、代码和图片。</p>
            <button type="button" className="primary" disabled={!ready} onClick={() => void createNode("note")}>新建笔记</button>
          </div>
        )}
      </section>
      {menu ? (
        <div
          ref={menuRef}
          className="notes-menu"
          style={menuPosition(menu.x, menu.y)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.kind === "new" ? (
            <>
              <button type="button" onClick={() => void createNode("note")}>新建笔记<kbd>{modLabel}N</kbd></button>
              <button type="button" onClick={() => void createNode("folder")}>新建文件夹<kbd>{modLabel}⇧N</kbd></button>
            </>
          ) : menuNode ? (
            <>
              {menuNode.kind === "folder" ? (
                <>
                  <button type="button" onClick={() => void createNode("note", menuNode.id)}>新建笔记</button>
                  <button type="button" onClick={() => void createNode("folder", menuNode.id)}>新建子文件夹</button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setRename({ id: menuNode.id, value: draft?.id === menuNode.id ? draft.title : menuNode.title });
                  setMenu(null);
                }}
              >
                重命名
              </button>
              <button type="button" onClick={() => { void toggleFlag(menuNode.id, "starred"); setMenu(null); }}>
                {menuNode.starred ? "取消收藏" : "收藏"}
              </button>
              <button type="button" onClick={() => { void toggleFlag(menuNode.id, "pinned"); setMenu(null); }}>
                {menuNode.pinned ? "取消置顶" : "置顶"}
              </button>
              <button type="button" onClick={() => { setDialog({ kind: "move", id: menuNode.id }); setMenu(null); }}>移动到…</button>
              <button
                type="button"
                className="is-danger"
                onClick={() => { setDialog({ kind: "delete", id: menuNode.id }); setMenu(null); }}
              >
                删除
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteDialog
          node={nodes.find((node) => node.id === dialog.id) ?? null}
          nodes={nodes}
          onClose={() => setDialog(null)}
          onConfirm={() => void deleteNode(dialog.id)}
        />
      ) : null}
      {dialog?.kind === "move" ? (
        <MoveDialog
          node={nodes.find((node) => node.id === dialog.id) ?? null}
          nodes={nodes}
          onClose={() => setDialog(null)}
          onMove={(parentId) => void moveNode(dialog.id, parentId)}
        />
      ) : null}
    </div>
  );
}

function folderLabel(nodes: NoteNode[], parentId: number | null) {
  if (parentId == null) return "全部笔记";
  return pathOf(nodes, parentId).map((node) => node.title.trim() || "未命名文件夹").join(" / ");
}

function DeleteDialog({
  node,
  nodes,
  onClose,
  onConfirm,
}: {
  node: NoteNode | null;
  nodes: NoteNode[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!node) return null;
  const extraNotes = descendantIds(nodes, node.id).filter((id) => nodes.find((item) => item.id === id)?.kind === "note").length;
  const title = shownTitle(node, null);
  return (
    <div className="modal-backdrop notes-modal" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="note-delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="note-delete-title">删除「{title}」</h2>
        <p className="muted">
          {node.kind === "folder"
            ? extraNotes ? `文件夹和里面的 ${extraNotes} 篇笔记会一起删除。` : "这个文件夹会被删除。"
            : "这篇笔记会被删除。"}
          删除后无法恢复。
        </p>
        <div className="actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="danger" onClick={onConfirm}>删除</button>
        </div>
      </div>
    </div>
  );
}

function MoveDialog({
  node,
  nodes,
  onClose,
  onMove,
}: {
  node: NoteNode | null;
  nodes: NoteNode[];
  onClose: () => void;
  onMove: (parentId: number | null) => void;
}) {
  const [parentId, setParentId] = useState<number | null>(node?.parentId ?? null);
  if (!node) return null;
  const blocked = new Set([node.id, ...descendantIds(nodes, node.id)]);
  const rows: { id: number | null; depth: number; title: string }[] = [{ id: null, depth: 0, title: "全部笔记" }];
  const walk = (id: number | null, depth: number) => {
    for (const folder of childrenOf(nodes, id)) {
      if (folder.kind !== "folder" || blocked.has(folder.id)) continue;
      rows.push({ id: folder.id, depth: depth + 1, title: folder.title.trim() || "未命名文件夹" });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <div className="modal-backdrop notes-modal" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="note-move-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="note-move-title">移动「{shownTitle(node, null)}」</h2>
        <div className="notes-move-list">
          {rows.map((row) => (
            <button
              key={row.id ?? "root"}
              type="button"
              className={parentId === row.id ? "is-selected" : ""}
              style={{ paddingLeft: 10 + row.depth * 16 }}
              onClick={() => setParentId(row.id)}
            >
              {row.title}
              {node.parentId === row.id ? <span>当前</span> : null}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={parentId === node.parentId} onClick={() => onMove(parentId)}>移动</button>
        </div>
      </div>
    </div>
  );
}

function NoteEditor({
  title,
  initialBody,
  updatedAt,
  saveState,
  focusTitle,
  starred,
  path,
  onTitle,
  onBody,
  onFlush,
  onStar,
  onOpenFolder,
  onMenu,
  onFocused,
}: {
  title: string;
  initialBody: string;
  updatedAt: string;
  saveState: SaveState;
  focusTitle: boolean;
  starred: boolean;
  path: NoteNode[];
  onTitle: (title: string) => void;
  onBody: (body: string) => void;
  onFlush: () => void;
  onStar: () => void;
  onOpenFolder: (id: number) => void;
  onMenu: (x: number, y: number) => void;
  onFocused: () => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const initialBodyRef = useRef(initialBody);
  const [empty, setEmpty] = useState(() => plainText(initialBody).trim() === "");
  const [count, setCount] = useState(() => wordCount(plainText(initialBody)));
  const [block, setBlock] = useState("p");
  const [pop, setPop] = useState<"color" | "mark" | "link" | null>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const popRef = useRef<HTMLElement | null>(null);
  function bindPop(node: HTMLElement | null) {
    popRef.current = node;
  }

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = sanitize(initialBodyRef.current);
    const needsTaskShape = [...editor.querySelectorAll("ul.note-tasks > li")].some(
      (item) => !item.querySelector(":scope > .note-task-body"),
    );
    normalizeTasks(editor);
    if (needsTaskShape) onBody(editor.innerHTML);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older webviews */ }
    if (focusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
      onFocused();
    }
    // Only on mount. Writing innerHTML again would drop the caret on every keystroke.
  }, []);

  useEffect(() => {
    if (!pop) return;
    function onPointer(event: globalThis.PointerEvent) {
      if (popRef.current?.contains(event.target as Node)) return;
      setPop(null);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [pop]);

  function publish() {
    const html = editorRef.current?.innerHTML ?? "";
    const text = plainText(html);
    setCount(wordCount(text));
    setEmpty(text.trim() === "");
    onBody(html);
    try {
      const value = document.queryCommandValue("formatBlock").toLowerCase();
      if (value.includes("h1")) setBlock("h1");
      else if (value.includes("h2")) setBlock("h2");
      else if (value.includes("h3")) setBlock("h3");
      else setBlock("p");
    } catch {
      setBlock("p");
    }
  }

  function rememberRange() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const anchor = selection.anchorNode;
    if (!anchor || !editor.contains(anchor)) return;
    rangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreRange() {
    const editor = editorRef.current;
    const range = rangeRef.current;
    editor?.focus();
    if (!range) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    try { selection.addRange(range); } catch { /* stale range */ }
  }

  function command(name: string, value?: string) {
    restoreRange();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(name, false, value);
    publish();
  }

  function applyBlock(tag: string) {
    restoreRange();
    try {
      document.execCommand("formatBlock", false, tag);
      const current = document.queryCommandValue("formatBlock").toLowerCase();
      if (!current.includes(tag)) document.execCommand("formatBlock", false, `<${tag}>`);
    } catch { /* ignore */ }
    if (tag === "p" || tag === "h1" || tag === "h2" || tag === "h3") setBlock(tag);
    publish();
  }

  function applyFontSize(px: string) {
    restoreRange();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    editorRef.current?.querySelectorAll("font[size='7']").forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    document.execCommand("styleWithCSS", false, "true");
    publish();
  }

  function applyColor(color: string) {
    command("foreColor", color);
    setPop(null);
  }

  function applyMark(color: string) {
    restoreRange();
    document.execCommand("styleWithCSS", false, "true");
    if (!document.execCommand("hiliteColor", false, color)) document.execCommand("backColor", false, color);
    publish();
    setPop(null);
  }

  function insertHtml(html: string) {
    restoreRange();
    document.execCommand("insertHTML", false, html);
    publish();
  }

  function insertTask() {
    const selected = escapeHtml(window.getSelection()?.toString().trim() ?? "");
    restoreRange();
    document.execCommand(
      "insertHTML",
      false,
      `<ul class="note-tasks"><li><input type="checkbox" contenteditable="false"><div class="note-task-body">${selected || "<br>"}</div></li></ul>`,
    );
    const editor = editorRef.current;
    if (editor) normalizeTasks(editor);
    const current = taskItem(window.getSelection()?.anchorNode ?? null);
    const body = current
      ? ensureTaskBody(current)
      : editor?.querySelector("ul.note-tasks > li:last-child > .note-task-body");
    if (body instanceof HTMLElement) placeCaret(body, !selected);
    publish();
  }

  function insertTime() {
    restoreRange();
    document.execCommand("insertText", false, formatDate(new Date()));
    publish();
  }

  function applyLink() {
    const url = safeUrl(linkUrl);
    if (!url) {
      showToast("请输入有效链接", "error");
      return;
    }
    const text = linkText.trim() || url;
    insertHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`);
    setPop(null);
    setLinkText("");
    setLinkUrl("");
  }

  function onImage(file: File) {
    if (!file.type.startsWith("image/")) {
      showToast("请选择图片", "error");
      return;
    }
    if (file.size > MAX_IMAGE) {
      showToast("图片太大，请控制在 1.5 MB 以内", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src.startsWith("data:image/")) return;
      insertHtml(`<img src="${src}" alt="">`);
    };
    reader.readAsDataURL(file);
  }

  function taskItem(node: Node | null) {
    const element = node instanceof Element ? node : node?.parentElement;
    const item = element?.closest("li");
    if (!(item instanceof HTMLLIElement) || !item.parentElement?.classList.contains("note-tasks")) return null;
    return item;
  }

  function normalizeTasks(root: ParentNode) {
    root.querySelectorAll("ul.note-tasks > li").forEach((node) => {
      if (node instanceof HTMLLIElement) ensureTaskBody(node);
    });
  }

  function ensureTaskBody(item: HTMLLIElement) {
    let box = item.querySelector(":scope > input[type='checkbox']");
    if (!(box instanceof HTMLInputElement)) {
      const created = document.createElement("input");
      created.type = "checkbox";
      item.prepend(created);
      box = created;
    }
    box.setAttribute("contenteditable", "false");
    const existing = item.querySelector(":scope > .note-task-body");
    if (existing instanceof HTMLElement) return existing;
    const body = document.createElement("div");
    body.className = "note-task-body";
    for (const node of [...item.childNodes]) {
      if (node !== box) body.appendChild(node);
    }
    if (!body.childNodes.length) body.appendChild(document.createElement("br"));
    item.appendChild(body);
    return body;
  }

  function taskPlain(item: HTMLLIElement) {
    const source = item.querySelector(":scope > .note-task-body") ?? item;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input").forEach((node) => node.remove());
    return (clone.textContent ?? "").replace(/\u00a0/g, " ").trim();
  }

  function placeCaret(el: HTMLElement, atStart: boolean) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(atStart);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function exitTask(item: HTMLLIElement) {
    const list = item.parentElement;
    if (!list) return;
    const following: Element[] = [];
    let sibling = item.nextElementSibling;
    while (sibling) {
      following.push(sibling);
      sibling = sibling.nextElementSibling;
    }
    item.remove();
    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    if (following.length) {
      const rest = document.createElement("ul");
      rest.className = "note-tasks";
      following.forEach((node) => rest.appendChild(node));
      if (list.childElementCount === 0) {
        list.replaceWith(paragraph);
        paragraph.after(rest);
      } else {
        list.after(paragraph, rest);
      }
    } else if (list.childElementCount === 0) {
      list.replaceWith(paragraph);
    } else {
      list.after(paragraph);
    }
    placeCaret(paragraph, true);
  }

  function continueTask(item: HTMLLIElement) {
    const body = ensureTaskBody(item);
    const nextBody = document.createElement("div");
    nextBody.className = "note-task-body";
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && body.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      try {
        const after = document.createRange();
        after.setStart(range.endContainer, range.endOffset);
        after.setEnd(body, body.childNodes.length);
        const fragment = after.extractContents();
        if (fragment.childNodes.length) nextBody.appendChild(fragment);
      } catch {
        /* keep an empty next line */
      }
    }
    if (!nextBody.childNodes.length) nextBody.appendChild(document.createElement("br"));
    if (!body.childNodes.length) body.appendChild(document.createElement("br"));
    const next = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("contenteditable", "false");
    next.append(box, nextBody);
    item.after(next);
    placeCaret(nextBody, true);
  }

  function removeEmptyTask(item: HTMLLIElement) {
    const list = item.parentElement;
    const previous = item.previousElementSibling;
    const next = item.nextElementSibling;
    item.remove();
    if (list && list.childElementCount === 0) {
      const paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      list.replaceWith(paragraph);
      placeCaret(paragraph, true);
      return;
    }
    const target = previous ?? next;
    if (target instanceof HTMLLIElement) placeCaret(ensureTaskBody(target), !previous);
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    const modKey = event.metaKey || event.ctrlKey;
    if (modKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onFlush();
      return;
    }
    if (modKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      rememberRange();
      setLinkText(window.getSelection()?.toString() ?? "");
      setPop("link");
      return;
    }
    if (event.shiftKey && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      insertTime();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const item = taskItem(window.getSelection()?.anchorNode ?? null);
      if (!item) return;
      event.preventDefault();
      if (!taskPlain(item)) exitTask(item);
      else continueTask(item);
      publish();
      return;
    }
    if (event.key === "Backspace") {
      const item = taskItem(window.getSelection()?.anchorNode ?? null);
      if (!item || taskPlain(item) !== "") return;
      event.preventDefault();
      removeEmptyTask(item);
      publish();
    }
  }

  function onEditorMouseDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    event.preventDefault();
    if (target.hasAttribute("checked")) target.removeAttribute("checked");
    else target.setAttribute("checked", "");
    target.checked = target.hasAttribute("checked");
    publish();
  }

  const saveLabel = saveState === "saving" ? "保存中" : saveState === "dirty" ? "未保存" : saveState === "error" ? "保存失败" : "已保存";

  return (
    <>
      <div className="note-top">
        <div className="note-path">
          <button type="button" onClick={() => onOpenFolder(-1)}>全部笔记</button>
          {path.map((folder) => (
            <span key={folder.id}>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => onOpenFolder(folder.id)}>{folder.title.trim() || "未命名文件夹"}</button>
            </span>
          ))}
        </div>
        <div className="note-top-actions">
          <button type="button" className={starred ? "note-icon-btn is-on" : "note-icon-btn"} aria-label={starred ? "取消收藏" : "收藏"} onClick={onStar}>
            <StarGlyph filled={starred} />
          </button>
          <button
            type="button"
            className="note-icon-btn"
            aria-label="笔记操作"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onMenu(rect.right - 180, rect.bottom + 6);
            }}
          >
            <MoreGlyph />
          </button>
        </div>
      </div>
      <div className="note-toolbar" onMouseDown={rememberRange}>
        <Tool label="撤销" onClick={() => command("undo")}>撤销</Tool>
        <Tool label="重做" onClick={() => command("redo")}>重做</Tool>
        <span className="note-tool-gap" />
        <select aria-label="段落样式" value={block} onMouseDown={rememberRange} onChange={(event) => applyBlock(event.target.value)}>
          <option value="p">正文</option>
          <option value="h1">标题 1</option>
          <option value="h2">标题 2</option>
          <option value="h3">标题 3</option>
        </select>
        <select aria-label="字号" defaultValue="" onMouseDown={rememberRange} onChange={(event) => { if (event.target.value) applyFontSize(event.target.value); }}>
          <option value="">字号</option>
          {["14px", "16px", "18px", "20px", "24px", "28px"].map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
        </select>
        <span className="note-tool-gap" />
        <Tool label="加粗" onClick={() => command("bold")}><strong>B</strong></Tool>
        <Tool label="斜体" onClick={() => command("italic")}><em>I</em></Tool>
        <Tool label="下划线" onClick={() => command("underline")}><span className="is-u">U</span></Tool>
        <Tool label="删除线" onClick={() => command("strikeThrough")}><span className="is-s">S</span></Tool>
        <span className="note-pop-anchor">
          <Tool label="文字颜色" onClick={() => { rememberRange(); setPop(pop === "color" ? null : "color"); }}>A</Tool>
          {pop === "color" ? (
            <div ref={bindPop} className="note-pop" onPointerDown={(event) => event.stopPropagation()}>
              {TEXT_COLORS.map((color) => (
                <button key={color} type="button" aria-label={color} style={{ background: color }} onMouseDown={(event) => event.preventDefault()} onClick={() => applyColor(color)} />
              ))}
            </div>
          ) : null}
        </span>
        <span className="note-pop-anchor">
          <Tool label="背景色" onClick={() => { rememberRange(); setPop(pop === "mark" ? null : "mark"); }}>高亮</Tool>
          {pop === "mark" ? (
            <div ref={bindPop} className="note-pop" onPointerDown={(event) => event.stopPropagation()}>
              {MARK_COLORS.map((color) => (
                <button key={color.value} type="button" aria-label={color.label} style={{ background: color.value }} onMouseDown={(event) => event.preventDefault()} onClick={() => applyMark(color.value)} />
              ))}
            </div>
          ) : null}
        </span>
        <span className="note-tool-gap" />
        <Tool label="无序列表" onClick={() => command("insertUnorderedList")}>• 列表</Tool>
        <Tool label="有序列表" onClick={() => command("insertOrderedList")}>1. 列表</Tool>
        <Tool label="待办" onClick={insertTask}>待办</Tool>
        <span className="note-tool-gap" />
        <Tool label="左对齐" onClick={() => command("justifyLeft")}>左</Tool>
        <Tool label="居中" onClick={() => command("justifyCenter")}>中</Tool>
        <Tool label="右对齐" onClick={() => command("justifyRight")}>右</Tool>
        <Tool label="减少缩进" onClick={() => command("outdent")}>减缩进</Tool>
        <Tool label="增加缩进" onClick={() => command("indent")}>缩进</Tool>
        <span className="note-tool-gap" />
        <Tool label="引用" onClick={() => applyBlock("blockquote")}>引用</Tool>
        <Tool label="代码" onClick={() => applyBlock("pre")}>代码</Tool>
        <Tool label="分割线" onClick={() => command("insertHorizontalRule")}>分割线</Tool>
        <span className="note-pop-anchor">
          <Tool label="链接" onClick={() => { rememberRange(); setLinkText(window.getSelection()?.toString() ?? ""); setPop(pop === "link" ? null : "link"); }}>链接</Tool>
          {pop === "link" ? (
            <form
              ref={bindPop}
              className="note-pop note-link-pop"
              onPointerDown={(event) => event.stopPropagation()}
              onSubmit={(event) => { event.preventDefault(); applyLink(); }}
            >
              <label>文本<input value={linkText} onChange={(event) => setLinkText(event.target.value)} /></label>
              <label>链接<input value={linkUrl} placeholder="https://" onChange={(event) => setLinkUrl(event.target.value)} /></label>
              <button type="submit" className="primary">插入</button>
            </form>
          ) : null}
        </span>
        <Tool label="图片" onClick={() => fileRef.current?.click()}>图片</Tool>
        <Tool label="当前时间" onClick={insertTime}>时间</Tool>
        <Tool label="清除格式" onClick={() => { command("removeFormat"); command("unlink"); }}>清除</Tool>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImage(file);
          }}
        />
      </div>
      <div className="note-scroll" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onFlush();
      }}>
        <div className="note-doc">
          <input
            ref={titleRef}
            className="note-title"
            value={title}
            placeholder="无标题"
            aria-label="标题"
            onChange={(event) => onTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                editorRef.current?.focus();
              }
            }}
          />
          <div className="note-canvas">
            {empty ? <div className="note-placeholder">从这里开始写。支持标题、列表、待办、引用和图片。</div> : null}
            <div
              ref={editorRef}
              className="note-body"
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="笔记正文"
              spellCheck={false}
              onInput={publish}
              onKeyDown={onEditorKeyDown}
              onPointerDown={onEditorMouseDown}
              onPaste={(event) => {
                const files = [...event.clipboardData.files];
                if (files.some((file) => file.type.startsWith("image/") && file.size > MAX_IMAGE)) {
                  event.preventDefault();
                  showToast("图片太大，请控制在 1.5 MB 以内", "error");
                }
              }}
            />
          </div>
        </div>
      </div>
      <footer className="note-footer">
        <span className={saveState === "error" ? "is-error" : ""}>{saveLabel}</span>
        <span>{count} 字</span>
        <span>{formatStamp(updatedAt)}</span>
      </footer>
    </>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="note-tool"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PanelChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg className="notes-panel-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "M14.5 6.5 9 12l5.5 5.5" : "M9.5 6.5 15 12l-5.5 5.5"} />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "note-chevron is-open" : "note-chevron"} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6.8 16.2 12 8.5 17.2Z" />
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg className="note-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M14 4.8V9h4.2" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg className="note-glyph is-folder" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.8 8.2V7.2A1.7 1.7 0 0 1 5.5 5.5h3.2l1.6 1.8h8.2A1.7 1.7 0 0 1 20.2 9v7.3a1.7 1.7 0 0 1-1.7 1.7H5.5a1.7 1.7 0 0 1-1.7-1.7Z" />
    </svg>
  );
}

function StarGlyph({ filled = false }: { filled?: boolean }) {
  return (
    <svg className={filled ? "note-star-glyph is-filled" : "note-star-glyph"} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 4.2 2.1 4.4 4.8.7-3.5 3.4.8 4.8L12 15.2 7.8 17.5l.8-4.8L5.1 9.3l4.8-.7Z" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg className="note-pin" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4.5h6l-1 5.2 2.2 2.3H7.8L10 9.7Z" />
      <path d="M12 12v7.5" />
    </svg>
  );
}

function MoreGlyph() {
  return (
    <svg className="note-more" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </svg>
  );
}
