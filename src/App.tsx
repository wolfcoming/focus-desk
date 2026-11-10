import { Reminder } from "./Reminder";
import { AndroidApp } from "./android/App";
import { isAndroid } from "./android/platform";
import { DesktopApp } from "./desktop/App";

export default function App() {
  const reminder = new URLSearchParams(window.location.search).get("view") === "reminder";
  if (reminder) return <Reminder />;
  if (isAndroid()) return <AndroidApp />;
  return <DesktopApp />;
}
