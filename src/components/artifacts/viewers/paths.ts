/** Path helpers for artifact paths (absolute paths from the backend; "/" or "\\" separators). */

export function separatorOf(path: string): string {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

/** Folder part of a path, without a trailing separator */
export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : i === 0 ? path.slice(0, 1) : "";
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Resolve `rel` against folder `dir`, collapsing "." and ".." segments */
export function resolvePath(dir: string, rel: string): string {
  if (isAbsolutePath(rel)) return rel;
  const sep = separatorOf(dir);
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join(sep);
}

/** "report.final.html" -> "report.final" */
export function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
