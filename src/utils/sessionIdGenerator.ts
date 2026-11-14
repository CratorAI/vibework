/**
 * Utility for generating unique session IDs
 */

/**
 * Generates a UUID v4 session ID
 * @returns A unique session identifier
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Generates a session ID with a custom prefix
 * @param prefix - Prefix to prepend to the session ID
 * @returns A unique session identifier with prefix
 */
export function generateSessionIdWithPrefix(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
