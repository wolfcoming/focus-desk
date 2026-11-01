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
  doneCriteria: string;
  targetDate: string | null;
  status: string;
  lastTouchedAt: string;
  nextTitle: string | null;
  kind: string;
  progress: string;
  important: boolean | null;
  dueAt: string | null;
  repeatDays: string | null;
  remindAt: string | null;
  progressPercent: number | null;
};

export type WorkLog = {
  id: number;
  subprojectId: number;
  body: string;
  progress: string;
  progressPercent: number | null;
  createdAt: string;
};

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

export type DailyView = { item: Item; state: string };
export type Suggested = { item: Item; reason: string };

export type TodayBoard = {
  day: string;
  slots: Item[];
  dailies: DailyView[];
  chores: Item[];
  suggestions: Suggested[];
};

export type WeeklyPacket = {
  inbox: Item[];
  stale: Subproject[];
  followUps: Item[];
  undatedImportant: Item[];
  overrides: { createdAt: string; rawText: string; reason: string; verdict: string }[];
};

export type Limits = {
  activeProjects: number;
  activeSubprojects: number;
  projectCap: number;
  subprojectCap: number;
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
};

export type ClarifyResult = { source: string; note: string; draft: ItemDraft };
export type MorningResult = {
  source: string;
  note: string;
  picks: { id: number; title: string; reason: string }[];
};
export type SettingsView = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  autostart: boolean;
  dataPath: string;
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
