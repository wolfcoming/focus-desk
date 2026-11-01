#!/bin/zsh
set -e
APP="/Users/yangqing/focus-desk/src-tauri/target/release/bundle/macos/Little Fun.app"
OUT="/Users/yangqing/focus-desk/Little Fun_0.1.0_x64.dmg"
STAGE="/tmp/fd-dmg-stage"

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

rm -f "$OUT"
hdiutil create -volname "Little Fun" -srcfolder "$STAGE" -ov -format UDZO "$OUT"

rm -rf "$STAGE"
echo "DMG_DONE $OUT"
