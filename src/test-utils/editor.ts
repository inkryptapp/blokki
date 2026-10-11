import { $createHeadingNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
	$copyNode,
	$createRangeSelection,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isTextNode,
	$setSelection,
	COPY_COMMAND,
	CUT_COMMAND,
	PASTE_COMMAND
} from 'lexical';
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

/** Puts the caret at the start of the Block at `index` in a mounted, focused Editor. */
export function placeCaretAtStart(editor: Editor, index: number): void {
	editor.lexical.update(
		() => {
			$getRoot().getChildAtIndex(index)?.selectStart();
		},
		{ discrete: true }
	);
}

/** Puts the caret `offset` characters into the text of the Block at `index`. */
export function placeCaretAt(editor: Editor, index: number, offset: number): void {
	editor.lexical.update(
		() => {
			const block = $getRoot().getChildAtIndex(index);
			const text = $isElementNode(block) ? block.getFirstDescendant() : null;
			if ($isTextNode(text)) {
				text.select(offset, offset);
			}
		},
		{ discrete: true }
	);
}

/** Selects text from an offset in one Block to an offset in another. */
export function selectText(
	editor: Editor,
	[fromIndex, fromOffset]: readonly [number, number],
	[toIndex, toOffset]: readonly [number, number]
): void {
	editor.lexical.update(
		() => {
			const textAt = (index: number) => {
				const block = $getRoot().getChildAtIndex(index);
				const text = $isElementNode(block) ? block.getFirstDescendant() : null;
				return $isTextNode(text) ? text : null;
			};
			const from = textAt(fromIndex);
			const to = textAt(toIndex);
			if (from !== null && to !== null) {
				const selection = $createRangeSelection();
				selection.anchor.set(from.getKey(), fromOffset, 'text');
				selection.focus.set(to.getKey(), toOffset, 'text');
				$setSelection(selection);
			}
		},
		{ discrete: true }
	);
}

/** Selects the Blocks from `first` to `last`, inclusive, in a mounted, focused Editor. */
export function selectBlocks(editor: Editor, first: number, last: number): void {
	editor.lexical.update(
		() => {
			const start = $getRoot().getChildAtIndex(first);
			const end = $getRoot().getChildAtIndex(last);
			if ($isElementNode(start) && $isElementNode(end)) {
				const selection = $createRangeSelection();
				selection.anchor.set(start.getKey(), 0, 'element');
				selection.focus.set(end.getKey(), end.getChildrenSize(), 'element');
				$setSelection(selection);
			}
		},
		{ discrete: true }
	);
}

/** Turns the Blocks in the selection into headings with `$setBlocksType`, as Turn Into does. */
export function turnIntoHeading(editor: Editor): void {
	editor.lexical.update(
		() => {
			$setBlocksType($getSelection(), () => $createHeadingNode('h2'));
		},
		{ discrete: true }
	);
}

/** Moves the Block at `from` after the Block at `after`, through Lexical's node API. */
export function moveBlock(editor: Editor, from: number, after: number): void {
	editor.lexical.update(
		() => {
			const block = $getRoot().getChildAtIndex(from);
			const target = $getRoot().getChildAtIndex(after);
			if (block !== null && target !== null) {
				target.insertAfter(block);
			}
		},
		{ discrete: true }
	);
}

/** Inserts a copy of the Block at `index` after it, the way a Duplicate command would. */
export function duplicateBlock(editor: Editor, index: number): void {
	editor.lexical.update(
		() => {
			const block = $getRoot().getChildAtIndex(index);
			if ($isElementNode(block)) {
				const copy = $copyNode(block);
				copy.append(...block.getChildren().map((child) => $copyNode(child)));
				block.insertAfter(copy);
			}
		},
		{ discrete: true }
	);
}

/**
 * Sends a clipboard event through Lexical's command for it, with a DataTransfer that stands in
 * for the system clipboard.
 */
export function clipboard(
	editor: Editor,
	type: 'copy' | 'cut' | 'paste',
	data: DataTransfer
): void {
	const command = type === 'copy' ? COPY_COMMAND : type === 'cut' ? CUT_COMMAND : PASTE_COMMAND;
	editor.lexical.dispatchCommand(command, new ClipboardEvent(type, { clipboardData: data }));
}
