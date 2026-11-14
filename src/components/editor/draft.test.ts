import { expect, it } from 'vitest';
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { FileMentionNode } from './FileMentionNode';
import { SkillNode } from './SkillNode';
import { restoreEditorDraft } from './draft';

it('restores a queued draft after IPC and disk serialization, including file and skill chips', () => {
  const options = { nodes: [FileMentionNode, SkillNode], onError: (error: Error) => { throw error; } };
  const original = createEditor(options);
  original.update(() => {
    $getRoot().append($createParagraphNode().append(
      $createTextNode('Please check '), new FileMentionNode('/tmp/report.txt'),
      $createTextNode(' with '), new SkillNode('review'),
    ));
  }, { discrete: true });
  const draft = JSON.parse(JSON.stringify({
    snapshot: original.getEditorState().toJSON(),
    attachments: [{ path: '/tmp/attachment.txt', name: 'attachment.txt' }],
  }));
  const reopened = createEditor(options);
  restoreEditorDraft(reopened, draft.snapshot);
  expect(reopened.getEditorState().toJSON()).toEqual(original.getEditorState().toJSON());
  expect(draft.attachments[0].path).toBe('/tmp/attachment.txt');
  reopened.getEditorState().read(() => expect($getRoot().getTextContent()).toContain('Please check'));
});
