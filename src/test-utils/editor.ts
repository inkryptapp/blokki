import { $getRoot } from 'lexical';
import type { Editor } from '../lib/index.js';

/** Reads the plain text of a mounted Editor's document. */
export function textOf(editor: Editor): string {
	return editor.lexical.getEditorState().read(() => $getRoot().getTextContent());
}
