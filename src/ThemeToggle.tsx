import { useTheme } from "./theme";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.2 13.4A6.4 6.4 0 0 1 10.6 6.4 6.6 6.6 0 1 0 16.2 13.4z" />
    </svg>
  );
}

export function ThemeToggle({ variant = "rail" }: { variant?: "rail" | "row" }) {
  const { mode, toggle } = useTheme();
  const night = mode === "night";
  const label = night ? "切换为日间模式" : "切换为夜间模式";

  if (variant === "row") {
    return (
      <button
        type="button"
        className="android-list-item"
        aria-pressed={night}
        aria-label={label}
        onClick={toggle}
      >
        <span className="android-list-title">外观</span>
        <span className="android-list-sub">{night ? "夜间" : "日间"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={night}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {night ? <MoonIcon /> : <SunIcon />}
      <span>{night ? "夜间" : "日间"}</span>
    </button>
  );
}
