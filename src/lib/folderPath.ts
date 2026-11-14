/**
 * Path helpers for home's folder picker: when a query is a path, how a
 * folder's path reads (with ~), and whether a known folder matches.
 */

/** A query that names a path: starts with ~, / or ./, or contains / */
export function isPathLike(query: string): boolean {
  const q = query.trim();
  return q.startsWith("~") || q.startsWith("/") || q.startsWith("./") || q.includes("/");
}

/** The path with the home folder as ~ */
export function tildePath(path: string, home: string | null): string {
  const clean = path.replace(/\/+$/, "") || "/";
  if (!home) return clean;
  const h = home.replace(/\/+$/, "");
  if (clean === h) return "~";
  return clean.startsWith(`${h}/`) ? `~${clean.slice(h.length)}` : clean;
}

/**
 * The folder a path sits in, as a quiet hint that fits beside a name:
 * "~/dev", else its last two folders ("…/clients/acme"), else its last one.
 */
export function parentHint(path: string, home: string | null, max = 18): string {
  const full = tildePath(path, home);
  const cut = full.lastIndexOf("/");
  const parent = cut <= 0 ? (full.startsWith("/") ? "/" : full) : full.slice(0, cut);
  if (parent.length <= max) return parent;
  const parts = parent.split("/").filter(Boolean);
  const two = `…/${parts.slice(-2).join("/")}`;
  return two.length <= max ? two : `…/${parts[parts.length - 1]}`;
}

/**
 * Whether a recent or pinned folder matches what was typed: its name, or
 * anywhere in its full path (as ~/… or absolute), case-insensitively.
 */
export function folderMatches(path: string, name: string, query: string, home: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  if (q.startsWith("./")) return false;
  const lower = path.toLowerCase();
  return lower.includes(q) || tildePath(path, home).toLowerCase().includes(q);
}

/** What the field holds after Tab completes into a folder: its path and a slash */
export function completedQuery(path: string, home: string | null): string {
  const p = tildePath(path, home);
  return p.endsWith("/") ? p : `${p}/`;
}

/**
 * Tab on a row, one step at a time like a shell: when the row lies deeper
 * than the directory typed so far ("~/de" and the recent ~/dev/vibework-v2),
 * complete only its next folder ("~/dev/"); otherwise the row itself.
 */
export function completeStep(path: string, query: string, home: string | null): string {
  const q = query.trim();
  const dirPart = q.slice(0, q.lastIndexOf("/") + 1);
  if (dirPart) {
    for (const form of [tildePath(path, home), path.replace(/\/+$/, "")]) {
      if (form.length > dirPart.length && form.toLowerCase().startsWith(dirPart.toLowerCase())) {
        const next = form.slice(dirPart.length).split("/")[0];
        if (next) return `${dirPart}${next}/`;
      }
    }
  }
  return completedQuery(path, home);
}
