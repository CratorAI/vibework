# Third-party material

This inventory does not grant a licence to Vibework's original code. The owner
has not selected one. The Vibework name, app icon and wordmark are not covered
by the eventual code licence. Third-party licences continue to apply separately.

| Material | Origin / retained terms | Distribution requirements |
| --- | --- | --- |
| OpenCode 2.2.7 sidecar | anomalyco/opencode, pinned URLs and SHA-256 in scripts/opencode-manifest.json; licenses/OpenCode.txt | MIT; retain notice. Its embedded runtime/dependency notices still need a binary-level inventory before distribution. |
| Claude Agent SDK bundle | src-tauri/resources/agents/claude.mjs; LICENSE-claude-sdk.md and README-claude-sdk.md beside it | Anthropic proprietary terms, **not an open-source licence**. Owner must resolve redistribution and own-login integration before publication. |
| IronCalc workbook | src/components/artifacts/sheet/vendor/ironcalc-workbook | MIT OR Apache-2.0; retain both supplied licences and THIRD-PARTY-NOTICES.md (react-colorful, MIT). |
| SheetJS 0.20.3 | CDN URL in package.json; licenses/SheetJS.txt | Apache-2.0; retain licence and applicable notices. |
| dagre | .vibework/skills/vibework-whiteboard/scripts/vendor | MIT; retain LICENSE-dagre.txt. |
| Iconoir 7.12.1 glyphs | src/lib/icons.tsx; src/lib/iconoir-LICENSE | MIT; retain copyright and licence. |
| Mona Sans / Geist Mono | @fontsource-variable packages; licenses/Mona-Sans.txt, licenses/Geist-Mono.txt | SIL OFL 1.1; retain notices and reserved font names; do not sell fonts alone. |
| Slide skill bundle | .vibework/skills/vibework-slides/scripts/THIRD_PARTY_LICENSES.txt | Contains package-specific terms. JSZip is used under its MIT option, not GPL. Preserve complete notices. |
| agent-browser skill documentation | .vibework/skills/agent-browser; upstream vercel-labs/agent-browser; licenses/agent-browser.txt | Apache-2.0 upstream; exact vendored revision is not recorded and must be confirmed. |
| skill-creator | .vibework/skills/skill-creator/LICENSE.txt | Apache-2.0; retain licence, attribution and modification notices. |
| T3 Code-derived recorded fixture | scripts/external/LICENSE-T3 and scripts/external/README.md | MIT; retain notice. |
| Service marks | public/service-icons/README.md records Simple Icons source | CC0 artwork; trademark rights remain with their owners. |

The permissive licences above allow redistribution with their conditions. None
of those identified requires an in-app attribution screen specifically; licence
texts must accompany distributed copies. The bundle includes this inventory and
retained licence resources. Direct application dependency declarations and available licence texts are retained
in licenses/DEPENDENCIES.md and licenses/npm. This is not yet a complete
transitive dependency audit.

## Claude integration: owner review required

The SDK's retained licence points to Anthropic's legal terms, not MIT or Apache.
The current [Claude Code legal documentation](https://code.claude.com/docs/en/legal-and-compliance)
distinguishes running an unmodified CLI with the user's credentials from third-party
SDK applications offering subscription login. It restricts the latter and also
restricts logo use. Do not assume a user's existing subscription authorizes this
SDK integration. Obtain permission or change the integration before shipping.

## Trademarks

Model/provider marks in `public/model-icons` identify external services. They do
not imply endorsement. Some SVG IDs refer to Lobe Icons; the repository does not
record a complete per-file download source or version. Treat that as provenance
still to verify, not a licence grant. Claude/Anthropic and OpenAI marks remain
their owners' trademarks. The owner must review each provider's brand rules;
retaining these files here is not approval to distribute them.

Model icon inventory (filename is the recorded identifier):

- `ai21.svg` — source not individually recorded.
- `alibaba-color.svg` — source not individually recorded.
- `aws-color.svg` — source not individually recorded.
- `baidu-color.svg` — source not individually recorded.
- `bytedance-color.svg` — source not individually recorded.
- `claude-color.svg` — source not individually recorded.
- `cohere-color.svg` — source not individually recorded.
- `deepseek-color.svg` — source not individually recorded.
- `fireworks-color.svg` — source not individually recorded.
- `gemini-color.svg` — source not individually recorded.
- `grok.svg` — source not individually recorded.
- `ibm.svg` — source not individually recorded.
- `inception.svg` — source not individually recorded.
- `liquid.svg` — source not individually recorded.
- `meta-color.svg` — source not individually recorded.
- `microsoft-color.svg` — source not individually recorded.
- `minimax-color.svg` — source not individually recorded.
- `mistral-color.svg` — source not individually recorded.
- `moonshot-color.svg` — source not individually recorded.
- `nousresearch.svg` — source not individually recorded.
- `nvidia-color.svg` — source not individually recorded.
- `openai.svg` — source not individually recorded.
- `openrouter.svg` — source not individually recorded.
- `perplexity-color.svg` — source not individually recorded.
- `qwen-color.svg` — source not individually recorded.
- `stepfun-color.svg` — source not individually recorded.
- `tencent-color.svg` — source not individually recorded.
- `upstage-color.svg` — source not individually recorded.
- `xiaomimimo.svg` — source not individually recorded.
- `zhipu-color.svg` — source not individually recorded.
