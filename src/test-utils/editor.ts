import { $getRoot } from 'lexical';
import type { Editor } from '../lib/index.js';

/** Reads the plain text of a mounted Editor's document. */
export function textOf(editor: Editor): string {
	return editor.lexical.getEditorState().read(() => $getRoot().getTextContent());
}

/** Puts the caret at the end of the Block at `index` in a mounted, focused Editor. */
export function placeCaretAtEnd(editor: Editor, index: number): void {
	editor.lexical.update(
		() => {
			$getRoot().getChildAtIndex(index)?.selectEnd();
		},
		{ discrete: true }
	);
}
