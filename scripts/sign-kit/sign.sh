#!/bin/bash
# Sign and notarize a Vibework build with your Apple Developer ID.
#
# Run this on the Mac that holds the "Developer ID Application" certificate,
# from the folder that contains Vibework.app and Entitlements.plist.
#
#   IDENTITY="Developer ID Application: Your Name (TEAMID)" \
#   NOTARY_PROFILE=vibework ./sign.sh
#
# One-time setup for notarization (asks for an app-specific password and
# keeps it in your own Keychain; nothing is sent to anyone else):
#
#   xcrun notarytool store-credentials vibework \
#     --apple-id you@example.com --team-id TEAMID
#
# Output, in ./out: the signed, notarized, stapled Vibework.app (zipped) and
# a signed, notarized DMG. Send both back.
set -euo pipefail
cd "$(dirname "$0")"
: "${IDENTITY:?Set IDENTITY to your Developer ID Application identity (see: security find-identity -v -p codesigning)}"
app="Vibework.app"
[ -d "$app" ] || { echo "Vibework.app is not in this folder." >&2; exit 1; }
[ -f Entitlements.plist ] || { echo "Entitlements.plist is not in this folder." >&2; exit 1; }
version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist")
arch=$(lipo -archs "$app/Contents/MacOS/Vibework" | tr ' ' '-')
[ "$arch" = arm64 ] && arch=aarch64
dmg="out/Vibework_${version}_${arch}.dmg"
stamp=(--timestamp)
# Ad-hoc signing ("-") is for testing this script only; it cannot be notarized.
if [ "$IDENTITY" = "-" ]; then stamp=(); NOTARY_PROFILE=""; fi
rm -rf out && mkdir out

echo "1/5 Signing"
# Every executable inside the app, innermost first, then the app itself.
while IFS= read -r -d '' f; do
  if file -b "$f" | grep -q "Mach-O" && [ "$f" != "$app/Contents/MacOS/Vibework" ]; then
    codesign --force --options runtime ${stamp[@]+"${stamp[@]}"} --entitlements Entitlements.plist -s "$IDENTITY" "$f"
  fi
done < <(find "$app" -type f -print0)
codesign --force --options runtime ${stamp[@]+"${stamp[@]}"} --entitlements Entitlements.plist -s "$IDENTITY" "$app"
codesign --verify --deep --strict "$app"

notarize() {
  if [ -z "${NOTARY_PROFILE:-}" ]; then echo "    (skipped: no NOTARY_PROFILE)"; return; fi
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait
}

echo "2/5 Notarizing the app (a few minutes)"
ditto -c -k --keepParent "$app" out/upload.zip
notarize out/upload.zip
rm out/upload.zip
[ -z "${NOTARY_PROFILE:-}" ] || { xcrun stapler staple "$app"; xcrun stapler validate "$app"; }

echo "3/5 Building the DMG"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Vibework.app"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -volname Vibework -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$dmg"
codesign --force ${stamp[@]+"${stamp[@]}"} -s "$IDENTITY" "$dmg"

echo "4/5 Notarizing the DMG (a few minutes)"
notarize "$dmg"
[ -z "${NOTARY_PROFILE:-}" ] || { xcrun stapler staple "$dmg"; xcrun stapler validate "$dmg"; }

echo "5/5 Packing the signed app"
ditto -c -k --keepParent "$app" "out/Vibework.app.zip"
[ -z "${NOTARY_PROFILE:-}" ] || spctl --assess --type execute --verbose=2 "$app"
echo
echo "Done. Send back both files in $(pwd)/out:"
ls -lh out
