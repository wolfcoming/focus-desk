import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AGP = "9.2.1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "src-tauri", "gen", "android");
const agpCoordinate = `com.android.tools.build:gradle:${AGP}`;
const agpPattern = /com\.android\.tools\.build:gradle:\d+\.\d+\.\d+/g;
const marker = "focus-desk-pin-agp";
const buildTaskMarker = "resolveNodeHome";
const r8Flag = "android.r8.gradual.support=true";

function newlineOf(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function insertAfterLine(text, line, block) {
  const at = text.indexOf(line);
  if (at === -1) return null;
  const nl = text.indexOf("\n", at);
  const cut = nl === -1 ? text.length : nl + 1;
  return text.slice(0, cut) + block + text.slice(cut);
}

function ensureHook(file, afterLine, hookLines) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  if (text.includes(marker)) return false;
  const nl = newlineOf(text);
  const block = hookLines.join(nl) + nl;
  const next = insertAfterLine(text, afterLine, block);
  if (next == null || next === text) return false;
  writeFileSync(file, next);
  return true;
}

function pinAgpVersions() {
  let pinned = false;
  for (const file of [
    join(androidDir, "build.gradle.kts"),
    join(androidDir, "buildSrc", "build.gradle.kts"),
  ]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const next = text.replace(agpPattern, agpCoordinate);
    if (next !== text) {
      writeFileSync(file, next);
      pinned = true;
    }
  }
  return pinned;
}

function ensureR8GradualSupport() {
  const file = join(androidDir, "gradle.properties");
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  if (text.includes("android.r8.gradual.support=")) return false;
  const nl = newlineOf(text);
  const next = text.endsWith("\n") || text.endsWith("\r\n")
    ? `${text}${nl}${r8Flag}${nl}`
    : `${text}${nl}${nl}${r8Flag}${nl}`;
  writeFileSync(file, next);
  return true;
}

function ensureBuildTask() {
  const dest = join(
    androidDir,
    "buildSrc",
    "src",
    "main",
    "java",
    "com",
    "focusdesk",
    "app",
    "kotlin",
    "BuildTask.kt",
  );
  const source = join(root, "scripts", "android", "BuildTask.kt");
  if (!existsSync(dest) || !existsSync(source)) return false;
  const current = readFileSync(dest, "utf8");
  if (current.includes(buildTaskMarker)) return false;
  copyFileSync(source, dest);
  return true;
}

export function pinAndroidAgp() {
  if (!existsSync(androidDir)) return false;

  const pinned = pinAgpVersions();
  const r8 = ensureR8GradualSupport();
  const buildTask = ensureBuildTask();

  ensureHook(join(androidDir, "gradlew.bat"), '@if "%DEBUG%"=="" @echo off', [
    "@rem focus-desk-pin-agp",
    'where node >nul 2>&1 && node "%~dp0..\\..\\..\\scripts\\pin-android-agp.mjs"',
  ]);
  ensureHook(join(androidDir, "gradlew"), "#!/bin/sh", [
    "# focus-desk-pin-agp",
    "if command -v node >/dev/null 2>&1; then",
    '  node "$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)/scripts/pin-android-agp.mjs" || true',
    "fi",
  ]);

  if (pinned) console.log(`Pinned Android Gradle Plugin to ${AGP}`);
  if (r8) console.log("Enabled android.r8.gradual.support");
  if (buildTask) console.log("Restored Android Studio BuildTask npm resolution");
  return pinned || r8 || buildTask;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return pathToFileURL(entry).href === import.meta.url;
  }
}

if (invokedDirectly()) pinAndroidAgp();
