import { invoke } from '@tauri-apps/api/core';
export interface GalleryItem {
  sessionId: string; taskName: string; taskSettled: boolean; path: string; name: string;
  typeHint: string; sizeBytes: number; modifiedMs: number; exists: boolean; presented: boolean;
  lastTouchedAt: string; touchTimeEstimated: boolean;
}
export const artifactsIndex = (forceRefresh = false) => invoke<GalleryItem[]>('artifacts_index', { forceRefresh });
