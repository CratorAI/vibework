import type { LexicalEditor, SerializedEditorState } from 'lexical';

// Queue drafts cross IPC and disk, so restore nodes from their serialized form,
// rather than treating the returned plain object as a live EditorState.
export function restoreEditorDraft(editor: LexicalEditor, snapshot: unknown) {
  editor.setEditorState(editor.parseEditorState(snapshot as SerializedEditorState));
}
