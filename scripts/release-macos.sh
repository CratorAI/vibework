#!/bin/bash
# Run by whoever holds the Developer ID. Tauri consumes the signing
# credentials from the environment; this script never prints them.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Library/Developer/CommandLineTools}"
# Build a plain DMG: the styled one drives Finder with AppleScript, which needs
# an automation permission prompt and fails when it is declined.
export CI=true
: "${APPLE_SIGNING_IDENTITY:?Developer ID Application identity required}"
: "${APPLE_TEAM_ID:?Apple team ID required}"
: "${APPLE_ID:?Apple ID required}"
: "${APPLE_PASSWORD:?App-specific password required}"
# The updater key is optional: without it the app and DMG are still signed and
# notarized, and the owner makes the updater bundle afterwards from the signed
# app. That lets someone who only holds the Developer ID build a release.
updater=false
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  : "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD?Updater password must be defined}"
  updater=true
fi
node scripts/version.mjs --check
node -e 'const c=require("./src-tauri/tauri.conf.json");if(c.plugins.updater.pubkey.startsWith("REPLACE_"))throw Error("Configure updater public key first")'
config_dir=$(mktemp -d)
config="$config_dir/release.json"
trap 'rm -rf "$config_dir"' EXIT
UPDATER=$updater node -e 'console.log(JSON.stringify({bundle:{createUpdaterArtifacts:process.env.UPDATER==="true",macOS:{signingIdentity:process.env.APPLE_SIGNING_IDENTITY}}}))' > "$config"
bun run tauri build --target "${RELEASE_TARGET:-aarch64-apple-darwin}" --bundles app,dmg --config "$config"
# Tauri signs, notarizes and staples the app (and builds its signed updater
# tarball when the updater key is present).
# Validate stapling before publishing. No release is created by this script.
root="${CARGO_TARGET_DIR:-src-tauri/target}/${RELEASE_TARGET:-aarch64-apple-darwin}/release/bundle"
xcrun stapler validate "$root/macos/Vibework.app"
for dmg in "$root"/dmg/*.dmg; do
  xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
done
echo
echo "Signed and notarized:"
ls -lh "$root"/dmg/*.dmg
if [ "$updater" = false ]; then
  ditto -c -k --keepParent "$root/macos/Vibework.app" "$root/macos/Vibework.app.zip"
  echo "Send back the DMG above and $root/macos/Vibework.app.zip"
fi
