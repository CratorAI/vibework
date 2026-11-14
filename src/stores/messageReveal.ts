/**
 * A message the conversation should scroll to and briefly highlight once it
 * is on screen (a message-text match chosen in the search window).
 */

let pending: { sessionId: string; messageId: string; word?: string; at: number } | null = null;
const listeners = new Set<() => void>();

/** How long a request waits for its task's history to load. */
const WAIT_MS = 15_000;

export const messageReveal = {
  /** `word`: a matched word, so a long message can be scrolled to where it says it */
  request(sessionId: string, messageId: string, word?: string) {
    pending = { sessionId, messageId, word, at: Date.now() };
    listeners.forEach((l) => l());
  },
  /** The message to reveal in this task, if one is waiting (not yet taken). */
  peek(sessionId: string | null): { messageId: string; word?: string } | null {
    if (!pending || pending.sessionId !== sessionId) return null;
    if (Date.now() - pending.at > WAIT_MS) {
      pending = null;
      return null;
    }
    return { messageId: pending.messageId, word: pending.word };
  },
  done() {
    pending = null;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
