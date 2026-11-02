#!/bin/zsh
# 双击运行 Little Fun（开发模式）
cd "$(dirname "$0")" || exit 1

# 使用当前 Node 和 Rust 工具链
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/v22.14.0/bin:$HOME/.cargo/bin:$PATH"

# 关闭上一次残留的实例，避免同时跑两份
pkill -f "target/debug/focus-desk" 2>/dev/null

npm run tauri dev
