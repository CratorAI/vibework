import { invoke } from "@tauri-apps/api/core";

export interface RecentFolder {
  path: string;
  /** ms since the epoch */
  usedAt: number;
}

/** The home folder picker's saved state (config.json). */
export interface FolderPrefs {
  recents: RecentFolder[];
  pinned: string[];
  /** The folder home starts in; null means no folder */
  homeFolder: string | null;
  /** Where tasks without a folder work */
  defaultFolder: string;
}

export const foldersApi = {
  get: () => invoke<FolderPrefs>("folders_get"),
  noteUsed: (path: string) => invoke<FolderPrefs>("folders_note_used", { path }),
  setPinned: (path: string, pinned: boolean) => invoke<FolderPrefs>("folders_set_pinned", { path, pinned }),
  setHome: (path: string | null) => invoke<FolderPrefs>("folders_set_home", { path }),
} as const;

/** A folder found by typing a path in home's picker */
export interface FolderEntry {
  name: string;
  path: string;
}

/** The folders in the directory a typed path names, filtered by its last segment */
export interface FolderCompletion {
  dir: string;
  entries: FolderEntry[];
  truncated: boolean;
  /** Why nothing can be listed or chosen here (the app's own data folder) */
  refused: string | null;
  /** The directory the path names does not exist */
  missing: boolean;
}

export const folderPathApi = {
  /** `base` is where "./" starts: the folder chosen on home, else the home folder */
  complete: (query: string, base: string | null) => invoke<FolderCompletion>("folders_complete", { query, base }),
  /** A typed folder may be chosen (exists, not the app's data); the path to use */
  check: (path: string) => invoke<string>("folders_check", { path }),
} as const;
