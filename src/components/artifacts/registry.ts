/**
 * Artifact type registry: which editor/viewer the workspace panel uses for a file.
 *
 * Dedicated editors live in sibling folders (doc/, sheet/, slides/,
 * whiteboard/, or any new one) and are picked up automatically: each folder's
 * `index.ts` must `export default` an `ArtifactType` (see ./types.ts), with a
 * lazy `component` so the editor's code loads only when it is used. A folder
 * without an index.ts, or whose default export is not an ArtifactType, is
 * ignored, so the build passes whichever editors exist.
 *
 * Resolution: the highest `priority` among types whose `matches(lowerCasedName)`
 * is true; on a tie, editors before the generic viewers (./viewers), and
 * within a group, the listed order. No match → null, and the panel shows the
 * "no preview" card.
 */

import type { ArtifactType } from "./types";
import { GENERIC_TYPES } from "./viewers/all";

const editorModules = import.meta.glob<{ default?: unknown }>(
  ["./*/index.ts", "./*/index.tsx", "!./viewers/**"],
  { eager: true },
);

function isArtifactType(value: unknown): value is ArtifactType {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ArtifactType>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.matches === "function" &&
    typeof v.priority === "number" &&
    !!v.component &&
    !!v.icon
  );
}

const EDITOR_TYPES: ArtifactType[] = Object.entries(editorModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([file, mod]) => {
    if (isArtifactType(mod.default)) return [mod.default];
    console.warn(`[artifacts] ${file} has no ArtifactType default export; ignored`);
    return [];
  });

/** Every registered type, editors first, in resolution order for equal priority */
export const ARTIFACT_TYPES: readonly ArtifactType[] = [...EDITOR_TYPES, ...GENERIC_TYPES];

/** The type that handles `fileName`, or null when nothing can show it */
export function resolveArtifactType(fileName: string): ArtifactType | null {
  const name = fileName.toLowerCase();
  let best: ArtifactType | null = null;
  for (const type of ARTIFACT_TYPES) {
    let matched = false;
    try {
      matched = type.matches(name);
    } catch (err) {
      console.warn(`[artifacts] ${type.id}.matches threw`, err);
    }
    if (matched && (!best || type.priority > best.priority)) best = type;
  }
  return best;
}

/** Whether the panel can render this file (by name) */
export function isPreviewable(fileName: string): boolean {
  return resolveArtifactType(fileName) !== null;
}

/** Look a type up by id */
export function artifactTypeById(id: string): ArtifactType | undefined {
  return ARTIFACT_TYPES.find((t) => t.id === id);
}
