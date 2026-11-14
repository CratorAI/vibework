#!/bin/bash
# Owner-run only. Tauri consumes signing credentials; never echo them.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Library/Developer/CommandLineTools}"
: "${APPLE_SIGNING_IDENTITY:?Developer ID Application identity required}"
: "${APPLE_TEAM_ID:?Apple team ID required}"
: "${APPLE_ID:?Apple ID required}"
: "${APPLE_PASSWORD:?App-specific password required}"
: "${TAURI_SIGNING_PRIVATE_KEY:?Updater key required}"
: "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD?Updater password must be defined}"
node scripts/version.mjs --check
node -e 'const c=require("./src-tauri/tauri.conf.json");if(c.plugins.updater.pubkey.startsWith("REPLACE_"))throw Error("Configure updater public key first")'
config_dir=$(mktemp -d)
config="$config_dir/release.json"
trap 'rm -rf "$config_dir"' EXIT
node -e 'console.log(JSON.stringify({bundle:{createUpdaterArtifacts:true,macOS:{signingIdentity:process.env.APPLE_SIGNING_IDENTITY}}}))' > "$config"
bun run tauri build --target "${RELEASE_TARGET:-aarch64-apple-darwin}" --bundles app,dmg --config "$config"
# Tauri signs, notarizes, staples the app and builds its signed updater tarball.
# Validate stapling before publishing. No release is created by this script.
root="${CARGO_TARGET_DIR:-src-tauri/target}/${RELEASE_TARGET:-aarch64-apple-darwin}/release/bundle"
xcrun stapler validate "$root/macos/Vibework.app"
for dmg in "$root"/dmg/*.dmg; do
  xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
done
