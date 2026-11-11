export type Project = {
  id: number;
  name: string;
  outcome: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Subproject = {
  id: number;
  projectId: number;
  projectName: string;
  name: string;
  description: string;
  targetDate: string | null;
  status: string;
  lastTouchedAt: string;
  nextTitle: string | null;
  kind: string;
  progress: string;
  important: boolean | null;
  urgent: boolean | null;
  dueAt: string | null;
  repeatDays: string | null;
  remindAt: string | null;
  progressPercent: number | null;
  quadrant: string | null;
  sortOrder: number;
};

export type WorkLog = {
  id: number;
  subprojectId: number;
  body: string;
  progress: string;
  progressPercent: number | null;
  /** work=调整进度时的工作日志；key=关键进展 */
  kind: string;
  createdAt: string;
};

export type IdeaTag = {
  id: number;
  subprojectId: number;
  body: string;
  color: string;
  sortOrder: number;
  /** 标签板内位置，百分比 0–100，以便签中心为准 */
  posX: number;
  posY: number;
  zIndex: number;
  createdAt: string;
};

export const IDEA_TAG_COLORS = [
  { value: "soft", label: "雾蓝" },
  { value: "amber", label: "暖杏" },
  { value: "mint", label: "薄荷" },
  { value: "rose", label: "浅玫" },
] as const;

export type Item = {
  id: number;
  kind: string;
  title: string;
  notes: string;
  projectId: number | null;
  subprojectId: number | null;
  projectName: string | null;
  subprojectName: string | null;
  important: boolean | null;
  urgent: boolean | null;
  dueAt: string | null;
  estimateMin: number | null;
  status: string;
  repeatDays: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  graceMin: number | null;
  interruptAfterGrace: boolean;
  waitingOn: string | null;
  followUpAt: string | null;
  startedAt: string | null;
  snoozeUntil: string | null;
  quadrant: string | null;
};

export type ItemDraft = {
  id?: number | null;
  kind: string;
  title: string;
  notes: string;
  projectId: number | null;
  subprojectId: number | null;
  important: boolean | null;
  urgent: boolean | null;
  dueAt: string | null;
  estimateMin: number | null;
  repeatDays: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  graceMin: number | null;
  interruptAfterGrace: boolean;
  waitingOn: string | null;
  followUpAt: string | null;
};

export const QUADRANT_OPTIONS = [
  { value: "iu", label: "重要且紧急", important: true, urgent: true },
  { value: "in", label: "重要不紧急", important: true, urgent: false },
  { value: "nu", label: "不重要但紧急", important: false, urgent: true },
  { value: "nn", label: "不重要不紧急", important: false, urgent: false },
] as const;

export function quadrantValue(important: boolean | null | undefined, urgent: boolean | null | undefined) {
  if (important == null || urgent == null) return "";
  return QUADRANT_OPTIONS.find((item) => item.important === important && item.urgent === urgent)?.value ?? "";
}

export function parseQuadrant(value: string) {
  return QUADRANT_OPTIONS.find((item) => item.value === value) ?? null;
}

export type DailyView = { item: Item; state: string };
export type Suggested = { item: Item; reason: string };

export type TodayBoard = {
  day: string;
  slots: Item[];
  completedCount: number;
  todos: Item[];
  dailies: DailyView[];
  chores: Item[];
  suggestions: Suggested[];
};

export type Reminder = {
  class: string;
  title: string;
  detail: string;
  itemId: number | null;
  subprojectId: number | null;
  firedAt: string;
};

export type Judgment = {
  matchedItemId: number | null;
  matchedTitle: string | null;
  verdict: "continue" | "finish_slice" | "switch";
  reason: string;
  snoozeMin: number;
  matchSource: string;
  thinking?: string | null;
};

export type ClarifyResult = {
  source: string;
  note: string;
  draft: ItemDraft;
  thinking?: string | null;
};
export type MorningResult = {
  source: string;
  note: string;
  picks: { id: number; title: string; reason: string }[];
  thinking?: string | null;
};
export type SettingsView = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  autostart: boolean;
  supportsAutostart: boolean;
  autoRemind: boolean;
  dataPath: string;
};

export type SyncStatusView = {
  baseUrl: string;
  email: string | null;
  displayName: string | null;
  signedIn: boolean;
  lastSyncAt: string | null;
  cursor: string | null;
};

export type SyncResultView = {
  pushed: number;
  pulled: number;
  accepted: number;
  rejected: number;
  serverTime: string;
};

export const projectStatus: Record<string, string> = {
  upcoming: "即将开始",
  active: "进行中",
  paused: "暂停",
  archived: "归档",
};

export const subStatus: Record<string, string> = {
  active: "进行中",
  paused: "暂停",
  done: "完成",
  archived: "归档",
};

export const dailyState: Record<string, string> = {
  pending: "未到时间窗",
  due: "到点了",
  late: "过了宽限",
  done: "今天已做",
};

export const verdictLabel: Record<Judgment["verdict"], string> = {
  continue: "继续当前",
  finish_slice: "先做完这小段",
  switch: "建议切换",
};

export const classLabel: Record<string, string> = {
  must_now: "必须现在",
  today: "今天要处理",
  daily_soft: "日常到点",
  daily_grace: "日常过了宽限",
  daily_grace_quiet: "日常待补",
  stall: "三天没动",
};
