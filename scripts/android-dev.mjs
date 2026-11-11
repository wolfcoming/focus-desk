import { spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

function lanIpv4() {
  const nets = networkInterfaces();
  for (const name of ["en0", "en1", "eth0", "wlan0"]) {
    for (const item of nets[name] || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return null;
}

const adb = `${process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const devicesOut = spawnSync(adb, ["devices", "-l"], { encoding: "utf8" }).stdout || "";
const deviceLine = devicesOut
  .split("\n")
  .find((line) => /\sdevice\s/.test(line) && !line.startsWith("List of"));
const model = deviceLine?.match(/model:(\S+)/)?.[1] || null;
const host = lanIpv4();

if (!model) {
  console.error("未检测到已连接的 Android 设备，请打开 USB 调试。");
  process.exit(1);
}
if (!host) {
  console.error("未检测到局域网 IP，请确认电脑已连 Wi‑Fi。");
  process.exit(1);
}

spawnSync(adb, ["reverse", "tcp:1420", "tcp:1420"], { stdio: "inherit" });
spawnSync(adb, ["reverse", "tcp:1421", "tcp:1421"], { stdio: "inherit" });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log(`Android 开发模式：设备 ${model}，前端 ${host}:1420`);
const result = spawnSync(
  process.execPath,
  ["scripts/tauri.mjs", "android", "dev", model, "--host", host, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root, env: process.env },
);
process.exit(result.status ?? 1);
