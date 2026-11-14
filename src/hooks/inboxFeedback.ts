/** Only our own actionable sentences cross from queue failures into the UI. */
export function inboxFeedback(error: unknown): string {
  const detail = String(error);
  if (detail.includes('not confirmed delivery') || detail.includes('before confirming delivery')) {
    return 'The agent has not confirmed delivery. Check the task before retrying.';
  }
  if (detail.includes('pending prompt first')) return 'Answer the pending prompt first.';
  return "Couldn't send this now. It will go when this turn finishes.";
}
