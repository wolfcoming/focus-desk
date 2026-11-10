import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pinAndroidAgp } from "./pin-android-agp.mjs";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const tauriJs = require.resolve("@tauri-apps/cli/tauri.js");
const result = spawnSync(process.execPath, [tauriJs, ...args], {
  stdio: "inherit",
  env: process.env,
});
let status = result.status ?? 1;

if (args[0] === "android") {
  try {
    pinAndroidAgp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (status === 0) status = 1;
  }
}

process.exit(status);
