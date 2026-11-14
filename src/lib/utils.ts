import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the custom font sizes from index.css (@theme --text-*),
// otherwise it treats `text-ui` as a colour and drops it next to `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["ui", "meta", "prose"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Turn a rejected Tauri invoke (usually a plain string) or a thrown Error into display text.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (typeof err === "string" && err.trim()) return err
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/** Last segment of a file path, handling both "/" and "\\" separators. */
export function pathBaseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

/** Second-to-last segment of a file path (the parent folder's name), or "". */
export function pathParentName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : ""
}
