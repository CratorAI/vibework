#!/bin/bash
# Build first. No running app or installed copy is touched until this succeeds.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Library/Developer/CommandLineTools}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${VIBEWORK_INSTALL_TARGET_DIR:-$HOME/Library/Caches/Vibework/install-target}}"
config_dir="$(mktemp -d -t vibework-signing)"
config="$config_dir/config.json"
stage=""
backup=""
cleanup() {
  rm -rf "$config_dir"
  if [[ -n "$backup" && -d "$backup" && ! -e /Applications/Vibework.app ]]; then
    mv "$backup" /Applications/Vibework.app
  fi
  [[ -z "$stage" ]] || rm -rf "$stage"
}
trap cleanup EXIT
# Tauri reads the standard Apple notarization environment directly.
bun -e 'console.log(JSON.stringify({bundle:{macOS:{signingIdentity:process.env.APPLE_SIGNING_IDENTITY || "-"}}}))' > "$config"
bun run tauri build --bundles app --config "$config"
bundle="$CARGO_TARGET_DIR/release/bundle/macos/Vibework.app"
test -x "$bundle/Contents/MacOS/Vibework"
codesign --verify --deep --strict "$bundle"
[[ "${1:-}" != "--build-only" ]] || exit 0
[[ $# == 0 ]] || { echo "Usage: $0 [--build-only]" >&2; exit 2; }
stage="$(mktemp -d /Applications/.vibework-install.XXXXXX)"
ditto "$bundle" "$stage/Vibework.app"
# NSRunningApplication targets a specific running instance, never bundle ID.
swift - <<'SWIFT'
import AppKit
import Foundation
let path = "/Applications/Vibework.app"
let copies = NSWorkspace.shared.runningApplications.filter {
    $0.bundleURL?.standardizedFileURL.path == path
}
for app in copies {
    guard app.terminate() else { exit(1) }
}
let deadline = Date().addingTimeInterval(30)
while copies.contains(where: { !$0.isTerminated }) {
    guard Date() < deadline else { exit(1) }
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
}
SWIFT
if [[ -e /Applications/Vibework.app ]]; then
  backup="$stage/previous.app"
  mv /Applications/Vibework.app "$backup"
fi
mv "$stage/Vibework.app" /Applications/Vibework.app
# Avoid single-instance handoff focusing an unrelated development copy.
if swift - <<'SWIFT'
import AppKit
let others = NSWorkspace.shared.runningApplications.contains {
    $0.bundleIdentifier == "com.vibeworkapp.vibework"
      && $0.bundleURL?.standardizedFileURL.path != "/Applications/Vibework.app"
}
exit(others ? 1 : 0)
SWIFT
then
  open /Applications/Vibework.app
else
  echo "Installed. Close other Vibework copies before opening /Applications/Vibework.app."
fi
