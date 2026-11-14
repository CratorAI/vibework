/**
 * Contract between the workspace panel and the editors/viewers it hosts.
 *
 * An artifact is a file in the conversation's working folder. The panel picks
 * an artifact type for it (by file name), mounts that type's component, and
 * tells it when the file changes on disk. The component owns loading, editing
 * and saving through `@/tauri/artifacts`.
 */

import type React from "react";

export interface ArtifactRef {
  /** Conversation the file belongs to; scopes every file call */
  sessionId: string;
  /** Canonical absolute path, as returned by statArtifact/readArtifact */
  path: string;
  /** File name with extension */
  name: string;
}

export interface ArtifactViewProps {
  allowNative?: boolean;
  artifact: ArtifactRef;
  /**
   * Last-modified time of the file on disk, in ms. Changes whenever the file
   * is written by anyone (the agent, another app, or this component's own save).
   * Components must reload when it changes to a value they did not just write,
   * and must not lose the user's unsaved edits silently: if there are unsaved
   * edits when an outside change arrives, keep the user's version on screen and
   * tell the panel through `onConflict`.
   */
  modifiedMs: number;
  /** True while the agent is running a turn in this conversation (it may be about to rewrite the file) */
  agentBusy: boolean;
  /** Report unsaved-edits state so the panel can show a dot on the tab and warn before closing */
  onDirtyChange?: (dirty: boolean) => void;
  /** The file changed on disk while the user had unsaved edits */
  onConflict?: (info: { diskModifiedMs: number }) => void;
  /** Clear the panel banner after the editor resolves a conflict. */
  onConflictResolved?: () => void;
  /** Ask the panel to open another file from the working folder (e.g. a link inside a document) */
  onOpenArtifact?: (path: string) => void;
}

export interface ArtifactType {
  /** Stable id, e.g. "doc", "sheet", "slides", "whiteboard", "html" */
  id: string;
  /** Shown on the tab and in menus, e.g. "Doc" */
  label: string;
  /** Lucide icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Whether this type handles the file. Receives the lower-cased file name. More specific types are asked first. */
  matches: (fileName: string) => boolean;
  /** Higher wins when several types match. Generic viewers use 0; dedicated editors use 10 or more. */
  priority: number;
  /** The editor/viewer. Loaded lazily so heavy editors do not weigh on app start. */
  component: React.LazyExoticComponent<React.ComponentType<ArtifactViewProps>>;
  /** Extension (with dot) for a new, empty artifact of this type, and its initial contents; omit if the type cannot be created empty */
  blank?: { extension: string; contents: () => string };
}
