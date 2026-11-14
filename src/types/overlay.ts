/**
 * Overlay notification types
 */

export type OverlayStatus =
  | { type: "permission"; message: string; session_id: string; session_name?: string }
  | { type: "question"; message: string; session_id: string; session_name?: string }
  | { type: "done"; message: string; session_id: string; session_name?: string };
