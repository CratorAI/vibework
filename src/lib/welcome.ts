/** Whether this person has been through the first-run welcome. */
const KEY = "vibework.welcomed";

export function wasWelcomed(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}

export function markWelcomed(): void {
  try { localStorage.setItem(KEY, "1"); } catch { /* the welcome shows again next time */ }
}
