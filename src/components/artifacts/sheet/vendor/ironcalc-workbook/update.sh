#!/bin/sh
# Re-vendor @ironcalc/workbook (MIT OR Apache-2.0) from npm.
#
# Why vendored instead of a normal dependency: the published bundle imports
# icons from lucide-react 1.x as a peer dependency, while the app is on 0.x
# (one icon, LineStyle, does not exist there), and it imports the engine from
# @ironcalc/wasm, while we need the same engine with xlsx import/export
# (@ironcalc/wasm-xlsx) so that only one wasm module is loaded.
#
# Usage (from this folder): ./update.sh 0.9.1
# Keep the version in step with @ironcalc/wasm-xlsx in package.json.
set -eu
VERSION="${1:?usage: ./update.sh <version>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sSfL "https://registry.npmjs.org/@ironcalc/workbook/-/workbook-$VERSION.tgz" | tar xz -C "$TMP"
cp "$TMP/package/dist/ironcalc.css" "$HERE/ironcalc.css"
cp "$TMP/package/LICENSE-MIT" "$TMP/package/LICENSE-Apache-2.0" "$TMP/package/THIRD-PARTY-NOTICES.md" "$HERE/"
{
  printf '// @ironcalc/workbook %s, vendored by update.sh (MIT OR Apache-2.0, see LICENSE-MIT / LICENSE-Apache-2.0).\n' "$VERSION"
  printf '// Patched: engine import -> @ironcalc/wasm-xlsx; lucide LineStyle -> local icon; grid focus only when focus is in the widget. Do not edit by hand.\n'
  printf '// @ts-nocheck\n'
  sed \
    -e 's#from "@ironcalc/wasm";#from "@ironcalc/wasm-xlsx";#' \
    -e 's#LineStyle as we, ##' \
    "$TMP/package/dist/ironcalc.js"
  printf '\n'
} > "$HERE/ironcalc.js"
# LineStyle (three stacked lines of decreasing weight) is not in lucide-react 0.x.
perl -0pi -e 's#(\nimport \{ Fragment as W, jsx as G, jsxs as K \} from "react/jsx-runtime";)#$1\nconst we = (p) => G("svg", { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...p, children: [G("path", { d: "M11 5h10" }), G("path", { d: "M11 12h10", strokeWidth: 3 }), G("path", { d: "M11 19h10", strokeDasharray: "2 3" }), G("path", { d: "M3 5h4" }), G("path", { d: "M3 12h4", strokeWidth: 3 }), G("path", { d: "M3 19h4", strokeDasharray: "2 3" })] });#' "$HERE/ironcalc.js"
# The widget re-focuses its grid after every render. Skip that when focus is
# elsewhere in the app, so a reload never pulls focus out of the chat composer
# (clicks inside the widget still focus it).
perl -0pi -e 's#(\ty\(\(\) => \{\n\t\ta\.current && \(n\.getEditingCell\(\)) \|\| O\(\)\);#$1 || (document.activeElement \&\& document.activeElement !== document.body \&\& !document.activeElement.closest(".ic-root")) || O());#' "$HERE/ironcalc.js"
grep -q 'n.getEditingCell() || (document.activeElement && document.activeElement !== document.body' "$HERE/ironcalc.js"
grep -q 'from "@ironcalc/wasm-xlsx"' "$HERE/ironcalc.js"
grep -q '^const we = ' "$HERE/ironcalc.js"
if grep -q 'LineStyle as' "$HERE/ironcalc.js"; then echo "LineStyle still imported" >&2; exit 1; fi
echo "vendored @ironcalc/workbook $VERSION"

# Ctrl/Cmd+Home is a destination, not an engine direction.
python3 - "$HERE/ironcalc.js" <<'PY_PATCH'
import sys
p=sys.argv[1]
s=open(p).read()
old='t.onNavigateToEdgeInDirection(e), l((e) => e + 1);'
assert old in s, "Upstream keyboard handler changed; review Home patch"
s=s.replace(old, 'if (e === "Home") { t.setSelectedCell(1, 1); t.setTopLeftVisibleCell(1, 1); } else { t.onNavigateToEdgeInDirection(e); } l((e) => e + 1);')
open(p,'w').write(s)
PY_PATCH
