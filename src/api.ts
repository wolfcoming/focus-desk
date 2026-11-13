import { invoke } from "@tauri-apps/api/core";
import type {
  ClarifyResult,
  Item,
  ItemDraft,
  MorningResult,
  Project,
  Reminder,
  SettingsView,
  Subproject,
  SubprojectAttachment,
  SyncResultView,
  SyncStatusView,
  TodayBoard,
  IdeaTag,
  NoteNode,
  WorkLog,
} from "./types";

export function message(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    try {
      return JSON.stringify(error);
    } catch {
      /* ignore */
    }
  }
  return "没有完成";
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input: { name: string; outcome: string; status: string }) =>
    invoke<Project>("create_project", { input }),
  updateProject: (id: number, name: string, outcome: string) =>
    invoke<Project>("update_project", { id, name, outcome }),
  setProjectStatus: (id: number, status: string) =>
    invoke<Project>("set_project_status", { id, status }),
  listSubprojects: (projectId: number | null) => invoke<Subproject[]>("list_subprojects", { projectId }),
  createSubproject: (input: {
    projectId: number;
    kind: string;
    name: string;
    description: string;
    important: boolean;
    urgent: boolean;
    progress: string;
    dueAt: string | null;
    repeatDays: string | null;
    remind: boolean;
    remindAt: string | null;
    progressPercent: number | null;
  }) => invoke<Subproject>("create_subproject", { input }),
  setSubprojectProgress: (id: number, progress: string, progressPercent: number | null, log: string | null) =>
    invoke<Subproject>("set_subproject_progress", { id, progress, progressPercent, log }),
  setSubprojectDue: (id: number, dueAt: string | null) =>
    invoke<Subproject>("set_subproject_due", { id, dueAt }),
  setSubprojectRepeat: (id: number, repeatDays: string) =>
    invoke<Subproject>("set_subproject_repeat", { id, repeatDays }),
  setSubprojectReminder: (id: number, remind: boolean, remindAt: string | null) =>
    invoke<Subproject>("set_subproject_reminder", { id, remind, remindAt }),
  setSubprojectQuadrant: (id: number, important: boolean, urgent: boolean) =>
    invoke<Subproject>("set_subproject_quadrant", { id, important, urgent }),
  renameSubproject: (id: number, name: string) =>
    invoke<Subproject>("rename_subproject", { id, name }),
  updateSubproject: (id: number, name: string, description: string) =>
    invoke<Subproject>("update_subproject", { id, name, description }),
  setSubprojectModules: (id: number, modules: string[]) =>
    invoke<Subproject>("set_subproject_modules", { id, modules }),
  setSubprojectNotes: (id: number, notes: string) =>
    invoke<Subproject>("set_subproject_notes", { id, notes }),
  setSubprojectRetrospect: (id: number, retrospect: string) =>
    invoke<Subproject>("set_subproject_retrospect", { id, retrospect }),
  listSubprojectAttachments: (subprojectId: number) =>
    invoke<SubprojectAttachment[]>("list_subproject_attachments", { subprojectId }),
  addSubprojectAttachment: (subprojectId: number, title: string, target: string) =>
    invoke<SubprojectAttachment>("add_subproject_attachment", { subprojectId, title, target }),
  deleteSubprojectAttachment: (id: number) =>
    invoke<void>("delete_subproject_attachment", { id }),
  openSubprojectAttachment: (id: number) =>
    invoke<void>("open_subproject_attachment", { id }),
  reorderSubprojects: (projectId: number, orderedIds: number[]) =>
    invoke<void>("reorder_subprojects", { projectId, orderedIds }),
  listWorkLogs: (projectId: number | null) => invoke<WorkLog[]>("list_work_logs", { projectId }),
  addWorkLog: (subprojectId: number, body: string) =>
    invoke<WorkLog>("add_work_log", { subprojectId, body }),
  updateWorkLog: (id: number, body: string) =>
    invoke<WorkLog>("update_work_log", { id, body }),
  deleteWorkLog: (id: number) => invoke<void>("delete_work_log", { id }),
  listIdeaTags: (subprojectId: number) => invoke<IdeaTag[]>("list_idea_tags", { subprojectId }),
  addIdeaTag: (subprojectId: number, body: string, color: string, posX: number, posY: number) =>
    invoke<IdeaTag>("add_idea_tag", { subprojectId, body, color, posX, posY }),
  updateIdeaTag: (id: number, body: string, color: string) =>
    invoke<IdeaTag>("update_idea_tag", { id, body, color }),
  moveIdeaTag: (id: number, posX: number, posY: number) =>
    invoke<IdeaTag>("move_idea_tag", { id, posX, posY }),
  deleteIdeaTag: (id: number) => invoke<void>("delete_idea_tag", { id }),
  setSubprojectStatus: (id: number, status: string, pauseSubprojectId: number | null) =>
    invoke<Subproject>("set_subproject_status", { id, status, pauseSubprojectId }),
  deleteProject: (id: number) => invoke<void>("delete_project", { id }),
  deleteSubproject: (id: number) => invoke<void>("delete_subproject", { id }),
  capture: (title: string) => invoke<Item>("capture", { title }),
  saveItem: (draft: ItemDraft) => invoke<Item>("save_item", { draft }),
  listItems: (kind: string | null) => invoke<Item[]>("list_items", { kind }),
  completeItem: (id: number) => invoke<Item>("complete_item", { id }),
  setTodoDone: (id: number, done: boolean) => invoke<Item>("set_todo_done", { id, done }),
  dropItem: (id: number) => invoke<void>("drop_item", { id }),
  startItem: (id: number) => invoke<Item>("start_item", { id }),
  setToday: (ids: number[]) => invoke<void>("set_today", { ids }),
  today: () => invoke<TodayBoard>("today_board"),
  bumpFollowUp: (id: number, days: number) => invoke<Item>("bump_follow_up", { id, days }),
  settings: () => invoke<SettingsView>("get_settings"),
  saveSettings: (input: {
    baseUrl: string;
    model: string;
    apiKey: string | null;
    clearApiKey: boolean;
    autostart: boolean;
    autoRemind: boolean;
  }) => invoke<SettingsView>("save_settings", { input }),
  activeReminder: () => invoke<Reminder | null>("active_reminder"),
  acknowledgeReminder: () => invoke<void>("acknowledge_reminder"),
  openReminderDetail: () =>
    invoke<{ page: string; projectId: number | null; subprojectId: number | null }>("open_reminder_detail"),
  postponeReminderDue: (minutes: number | null, at: string | null) =>
    invoke<void>("postpone_reminder_due", { minutes, at }),
  resolveStall: (action: string) => invoke<void>("resolve_stall", { action }),
  checkReminders: () => invoke<Reminder | null>("check_reminders"),
  testAiConnection: (baseUrl: string | null, model: string | null, apiKey: string | null) =>
    invoke<string>("test_ai_connection", { baseUrl, model, apiKey }),
  clarify: (id: number) => invoke<ClarifyResult>("ai_clarify", { id }),
  morning: () => invoke<MorningResult>("ai_morning"),
  followUpLines: (id: number, extra: string | null) =>
    invoke<{ scripts: string[]; thinking: string | null }>("ai_follow_up_lines", { id, extra }),
  loadDemo: () => invoke<void>("load_demo"),
  syncStatus: () => invoke<SyncStatusView>("get_sync_status"),
  setSyncBaseUrl: (baseUrl: string) => invoke<SyncStatusView>("set_sync_base_url", { baseUrl }),
  syncRegister: (email: string, password: string, displayName?: string | null, baseUrl?: string | null) =>
    invoke<SyncStatusView>("sync_register", {
      email,
      password,
      displayName: displayName ?? null,
      baseUrl: baseUrl ?? null,
    }),
  syncLogin: (email: string, password: string, baseUrl?: string | null) =>
    invoke<SyncStatusView>("sync_login", { email, password, baseUrl: baseUrl ?? null }),
  syncLogout: () => invoke<SyncStatusView>("sync_logout"),
  syncSetDisplayName: (displayName: string) =>
    invoke<SyncStatusView>("sync_set_display_name", { displayName }),
  syncNow: () => invoke<SyncResultView>("sync_now"),
  listNotes: () => invoke<NoteNode[]>("list_note_nodes"),
  createNote: (kind: "folder" | "note", parentId: number | null, title: string) =>
    invoke<NoteNode>("create_note_node", { kind, parentId, title }),
  saveNote: (id: number, title: string, body: string) =>
    invoke<NoteNode>("save_note_node", { id, title, body }),
  renameNote: (id: number, title: string) =>
    invoke<NoteNode>("rename_note_node", { id, title }),
  setNoteStarred: (id: number, starred: boolean) =>
    invoke<NoteNode>("set_note_starred", { id, starred }),
  setNotePinned: (id: number, pinned: boolean) =>
    invoke<NoteNode>("set_note_pinned", { id, pinned }),
  moveNote: (id: number, parentId: number | null) =>
    invoke<NoteNode>("move_note_node", { id, parentId }),
  deleteNote: (id: number) => invoke<void>("delete_note_node", { id }),
};
