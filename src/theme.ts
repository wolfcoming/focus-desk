import { useEffect, useState } from "react";

export type ThemeMode = "day" | "night";

export const THEME_KEY = "focus-desk.theme";
const THEME_EVENT = "focus-desk-theme";

export function readTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* private mode or a locked store */
  }
}

export function installTheme() {
  document.documentElement.dataset.theme = readTheme();
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    function sync() {
      setMode(readTheme());
    }
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  function toggle() {
    const next: ThemeMode = readTheme() === "night" ? "day" : "night";
    applyTheme(next);
    setMode(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return { mode, toggle };
}
