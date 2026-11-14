/** Paths, image URLs and image saving for a Doc in the conversation's working folder. */

import { statArtifact, writeArtifact, isArtifactError } from "@/tauri/artifacts";

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : i === 0 ? path.slice(0, 1) : "";
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Resolve a relative link target against a folder, collapsing "." and ".." */
export function resolvePath(dir: string, rel: string): string {
  if (isAbsolutePath(rel)) return rel;
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
    } else parts.push(seg);
  }
  return parts.join(sep);
}

/** True for links that leave the working folder (web, mail, other schemes) */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/** Absolute path of a relative link in the document, or null for external/anchor links */
export function linkTargetPath(docPath: string, href: string): string | null {
  if (!href || href.startsWith("#") || isExternalHref(href)) return null;
  const clean = href.split(/[?#]/)[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep as written */
  }
  return resolvePath(dirName(docPath), decoded);
}

/** URL to display an image source: relative paths resolve against the document's artifact URL */
export function resolveImageUrl(src: string, docUrl: string): string {
  if (!src) return src;
  if (isExternalHref(src) || src.startsWith("data:")) return src;
  if (isAbsolutePath(src)) return src;
  try {
    return new URL(src, docUrl).href;
  } catch {
    return src;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
}

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function exists(sessionId: string, path: string): Promise<boolean> {
  try {
    await statArtifact(sessionId, path);
    return true;
  } catch (err) {
    if (isArtifactError(err) && err.code === "not_found") return false;
    throw err;
  }
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Save image files next to the document and return Markdown sources relative
 * to it. Named after the original file when it has a meaningful name, else
 * "<doc>-image-<timestamp>".
 */
export async function saveImagesNextTo(
  sessionId: string,
  docPath: string,
  docName: string,
  files: File[],
): Promise<{ src: string; alt: string }[]> {
  const dir = dirName(docPath);
  const sep = docPath.includes("\\") && !docPath.includes("/") ? "\\" : "/";
  const out: { src: string; alt: string }[] = [];
  for (const file of files) {
    const ext = EXT_BY_TYPE[file.type] ?? (file.name.split(".").pop() || "png").toLowerCase();
    const original = slug(stem(file.name));
    const generic = !original || /^(image|clipboard|screenshot|untitled|blob)(-?\d*)$/i.test(original);
    const base = generic ? `${slug(stem(docName)) || "doc"}-image-${timestamp()}` : original;
    let name = `${base}.${ext}`;
    for (let i = 2; await exists(sessionId, `${dir}${sep}${name}`); i++) name = `${base}-${i}.${ext}`;
    const base64 = await readBase64(file);
    await writeArtifact(sessionId, `${dir}${sep}${name}`, { base64 });
    out.push({ src: name, alt: generic ? "" : stem(file.name) });
  }
  return out;
}
