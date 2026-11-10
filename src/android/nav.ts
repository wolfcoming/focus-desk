export type Tab = "today" | "todos" | "projects" | "more";

export type Frame =
  | { type: "tab"; tab: Tab }
  | { type: "settings" }
  | { type: "project"; id: number }
  | { type: "sub"; projectId: number; subId: number }
  | { type: "todo"; id: number };

export type NavState = { stack: Frame[] };

export function rootTab(stack: Frame[]): Tab {
  const root = stack[0];
  return root?.type === "tab" ? root.tab : "today";
}

export function topFrame(stack: Frame[]): Frame {
  return stack[stack.length - 1] ?? { type: "tab", tab: "today" };
}

export function isNested(stack: Frame[]): boolean {
  return stack.length > 1;
}

export function readNavState(state: unknown): NavState {
  if (!state || typeof state !== "object") return { stack: [{ type: "tab", tab: "today" }] };
  const stack = (state as { stack?: unknown }).stack;
  if (!Array.isArray(stack) || stack.length === 0) return { stack: [{ type: "tab", tab: "today" }] };
  return { stack: stack as Frame[] };
}
