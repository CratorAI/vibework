import { expect, it } from 'vitest';
import { inboxFeedback } from './inboxFeedback';
it.each([
  'Engine returned HTTP 409: Pending input cannot change to steer: msg_private',
  'Codex turn/steer: expectedTurnId mismatch',
  'Claude Code priority-now refused',
  new Error('network failed'),
])('keeps provider details out of queue feedback: %s', error => {
  expect(inboxFeedback(error)).toBe("Couldn't send this now. It will go when this turn finishes.");
});
it('does not promise auto-delivery for an uncertain receipt', () => {
  expect(inboxFeedback('The agent has not confirmed delivery')).toBe('The agent has not confirmed delivery. Check the task before retrying.');
});
it('explains a prompt that appeared during Send now', () => {
  expect(inboxFeedback('Answer the pending prompt first.')).toBe('Answer the pending prompt first.');
});
