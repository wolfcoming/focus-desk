export type Tab = "todos" | "notes" | "today" | "projects" | "more";

export type Frame =
  | { type: "tab"; tab: Tab }
  | { type: "settings" }
  | { type: "auth" }
  | { type: "project"; id: number }
  | { type: "sub"; projectId: number; subId: number }
  | { type: "todo"; id: number };

export type NavState = { stack: Frame[] };

export const HOME_TAB: Tab = "todos";

export function rootTab(stack: Frame[]): Tab {
  const root = stack[0];
  return root?.type === "tab" ? root.tab : HOME_TAB;
}

export function topFrame(stack: Frame[]): Frame {
  return stack[stack.length - 1] ?? { type: "tab", tab: HOME_TAB };
}

export function isNested(stack: Frame[]): boolean {
  return stack.length > 1;
}

export function readNavState(state: unknown): NavState {
  if (!state || typeof state !== "object") return { stack: [{ type: "tab", tab: HOME_TAB }] };
  const stack = (state as { stack?: unknown }).stack;
  if (!Array.isArray(stack) || stack.length === 0) return { stack: [{ type: "tab", tab: HOME_TAB }] };
  return { stack: stack as Frame[] };
}
