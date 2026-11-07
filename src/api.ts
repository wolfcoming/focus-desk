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
  TodayBoard,
  IdeaTag,
  WorkLog,
  WeeklyPacket,
} from "./types";

export function message(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "没有完成";
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input: { name: string; outcome: string; status: string }) =>
    invoke<Project>("create_project", { input }),
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
  weekly: () => invoke<WeeklyPacket>("weekly_packet"),
  bumpFollowUp: (id: number, days: number) => invoke<Item>("bump_follow_up", { id, days }),
  settings: () => invoke<SettingsView>("get_settings"),
  saveSettings: (input: {
    baseUrl: string;
    model: string;
    apiKey: string | null;
    clearApiKey: boolean;
    autostart: boolean;
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
  weeklyAssist: () => invoke<{ source: string; summary: string; thinking?: string | null }>("ai_weekly"),
  followUpLines: (id: number, extra: string | null) =>
    invoke<{ scripts: string[]; thinking: string | null }>("ai_follow_up_lines", { id, extra }),
  loadDemo: () => invoke<void>("load_demo"),
};
