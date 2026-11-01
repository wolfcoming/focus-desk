import { invoke } from "@tauri-apps/api/core";
import type {
  ClarifyResult,
  Item,
  ItemDraft,
  Judgment,
  Limits,
  MorningResult,
  Project,
  Reminder,
  SettingsView,
  Subproject,
  TodayBoard,
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
  createProject: (input: { name: string; outcome: string; status: string; pauseProjectId: number | null }) =>
    invoke<Project>("create_project", { input }),
  setProjectStatus: (id: number, status: string, pauseProjectId: number | null) =>
    invoke<Project>("set_project_status", { id, status, pauseProjectId }),
  listSubprojects: (projectId: number | null) => invoke<Subproject[]>("list_subprojects", { projectId }),
  createSubproject: (input: {
    projectId: number;
    kind: string;
    name: string;
    important: boolean;
    progress: string;
    dueAt: string | null;
    repeatDays: string | null;
    remind: boolean;
    remindAt: string | null;
    progressPercent: number | null;
  }) => invoke<Subproject>("create_subproject", { input }),
  setSubprojectProgress: (id: number, progress: string, progressPercent: number | null, log: string | null) =>
    invoke<Subproject>("set_subproject_progress", { id, progress, progressPercent, log }),
  listWorkLogs: (projectId: number | null) => invoke<WorkLog[]>("list_work_logs", { projectId }),
  setSubprojectStatus: (id: number, status: string, pauseSubprojectId: number | null) =>
    invoke<Subproject>("set_subproject_status", { id, status, pauseSubprojectId }),
  deleteProject: (id: number) => invoke<void>("delete_project", { id }),
  deleteSubproject: (id: number) => invoke<void>("delete_subproject", { id }),
  capture: (title: string) => invoke<Item>("capture", { title }),
  saveItem: (draft: ItemDraft) => invoke<Item>("save_item", { draft }),
  listItems: (kind: string | null) => invoke<Item[]>("list_items", { kind }),
  completeItem: (id: number) => invoke<Item>("complete_item", { id }),
  dropItem: (id: number) => invoke<void>("drop_item", { id }),
  startItem: (id: number) => invoke<Item>("start_item", { id }),
  setToday: (ids: number[]) => invoke<void>("set_today", { ids }),
  today: () => invoke<TodayBoard>("today_board"),
  weekly: () => invoke<WeeklyPacket>("weekly_packet"),
  limits: () => invoke<Limits>("limits"),
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
  previewJudgment: (text: string) => invoke<Judgment>("preview_judgment", { text }),
  resolveReminder: (text: string, follow: boolean) => invoke<Judgment>("resolve_reminder", { text, follow }),
  acknowledgeReminder: () => invoke<void>("acknowledge_reminder"),
  resolveStall: (action: string) => invoke<void>("resolve_stall", { action }),
  checkReminders: () => invoke<Reminder | null>("check_reminders"),
  clarify: (id: number) => invoke<ClarifyResult>("ai_clarify", { id }),
  morning: () => invoke<MorningResult>("ai_morning"),
  weeklyAssist: () => invoke<{ source: string; summary: string }>("ai_weekly"),
};
