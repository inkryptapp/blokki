import { HistoryExtension } from '@lexical/history';
import { configExtension, UNDO_COMMAND } from 'lexical';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import unsupported from '../../test-fixtures/snapshots/unsupported-nodes.json';
import {
	clipboard,
	duplicateBlock,
	moveBlock,
	placeCaretAt,
	placeCaretAtEnd,
	placeCaretAtStart,
	selectBlocks,
	selectText,
	turnInto
} from '../../test-utils/editor.js';
import { NoteNode, noteExtension } from '../../test-utils/note.js';
import { BlockIdExtension, parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent, type Editor, type EditorOptions } from '../index.js';

const BLOCK_ID = /^[A-Za-z0-9_-]{10}$/;
const [first, second, empty, last] = paragraphs.root.children.map((node) => node.$.blockId);

interface Block {
	readonly id: unknown;
	readonly type: string;
	readonly text: string;
}

/** The Blocks of the exported Snapshot, with their Block IDs and text. */
function blocksOf(editor: Editor): Block[] {
	return editor.getSnapshot().root.children.map((node) => ({
		id: node.$?.['blockId'],
		type: node.type,
		text: ('children' in node && Array.isArray(node.children) ? node.children : [])
			.map((child: { text?: string }) => child.text ?? '')
			.join('')
	}));
}

async function mountEditor(options: EditorOptions = {}): Promise<Editor> {
	const editor = createEditor({ content: parseSnapshot(paragraphs), ...options });
	await render(EditorContent, { editor, 'aria-label': 'Document' });
	await page.getByRole('textbox', { name: 'Document' }).click();
	return editor;
}

/** A second Block type that the tests define, for Turn Into. */
const noteBlocks = [
	noteExtension(3),
	configExtension(BlockIdExtension, { blockTypes: [NoteNode] })
];

function expectNewId(block: Block | undefined, ...taken: unknown[]): void {
	expect(block?.id).toMatch(BLOCK_ID);
	expect(taken).not.toContain(block?.id);
}

describe('Block ID rules', () => {
	it('1. Enter in the middle of a Block keeps the ID above and gives the Block below a new one', async () => {
		const editor = await mountEditor();
		placeCaretAt(editor, 0, 17);

		await userEvent.keyboard('{Enter}');

		const blocks = blocksOf(editor);
		expect(blocks.slice(0, 2).map(({ text }) => text)).toEqual(['The first paragra', 'ph.']);
		expect(blocks[0]?.id).toBe(first);
		expectNewId(blocks[1], first, second, empty, last);
	});

	it('1. Enter at the end of a Block keeps its ID and gives the new Block below a new one', async () => {
		const editor = await mountEditor();
		placeCaretAtEnd(editor, 0);

		await userEvent.keyboard('{Enter}');

		const blocks = blocksOf(editor);
		expect(blocks[0]).toMatchObject({ id: first, text: 'The first paragraph.' });
		expectNewId(blocks[1], first, second, empty, last);
		expect(blocks[2]?.id).toBe(second);
	});

	it('1. Enter after a selection across Blocks gives the Block below a new ID', async () => {
		const editor = await mountEditor();
		selectText(editor, [0, 9], [3, 6]);

		await userEvent.keyboard('{Enter}');

		const blocks = blocksOf(editor);
		expect(blocks.map(({ text }) => text)).toEqual(['The first', 'an empty paragraph.']);
		expect(blocks[0]?.id).toBe(first);
		expectNewId(blocks[1], first, second, empty, last);
	});

	it('2. Enter at the start of a Block adds a new Block above and keeps the ID on the content', async () => {
		const editor = await mountEditor();
		placeCaretAtStart(editor, 0);

		await userEvent.keyboard('{Enter}');

		const blocks = blocksOf(editor);
		expect(blocks[0]?.text).toBe('');
		expectNewId(blocks[0], first, second, empty, last);
		expect(blocks[1]).toMatchObject({ id: first, text: 'The first paragraph.' });
		await userEvent.keyboard('Typed');
		expect(blocksOf(editor)[1]).toMatchObject({ id: first, text: 'TypedThe first paragraph.' });
	});

	it('3. Backspace at the start of a Block merges it into the Block above, which keeps its ID', async () => {
		const editor = await mountEditor();
		placeCaretAtStart(editor, 1);

		await userEvent.keyboard('{Backspace}');

		const blocks = blocksOf(editor);
		expect(blocks).toHaveLength(3);
		expect(blocks[0]).toMatchObject({
			id: first,
			text: 'The first paragraph.The second paragraph, a little longer than the first one.'
		});
	});

	it('3. Backspace below an empty Block removes the empty Block and keeps the ID below', async () => {
		const editor = await mountEditor();
		placeCaretAtStart(editor, 3);

		await userEvent.keyboard('{Backspace}');

		expect(blocksOf(editor).map(({ id, text }) => [id, text])).toEqual([
			[first, 'The first paragraph.'],
			[second, 'The second paragraph, a little longer than the first one.'],
			[last, 'After an empty paragraph.']
		]);
	});

	it('4. Turning a Block into another type keeps its ID', async () => {
		const editor = await mountEditor({ extensions: noteBlocks });
		placeCaretAtEnd(editor, 1);

		turnInto(editor, () => new NoteNode());

		const blocks = blocksOf(editor);
		expect(blocks[1]).toMatchObject({ id: second, type: 'acme-note' });
		expect(blocks.map(({ id }) => id)).toEqual([first, second, empty, last]);
	});

	it('4. Turning several Blocks into another type keeps each ID, next to other root nodes', async () => {
		const content = parseSnapshot(unsupported);
		const editor = createEditor({ content, extensions: noteBlocks });
		await render(EditorContent, { editor, 'aria-label': 'Document' });
		await page.getByRole('textbox', { name: 'Document' }).click();
		const ids = content.root.children.map((node) => node.$?.['blockId']);
		selectBlocks(editor, 2, 3);

		turnInto(editor, () => new NoteNode());

		const blocks = blocksOf(editor);
		expect(blocks.map(({ type }) => type)).toEqual([
			'paragraph',
			'acme-kanban',
			'acme-note',
			'acme-note'
		]);
		expect(blocks.map(({ id }) => id)).toEqual(ids);
	});

	it('5. Moving a Block keeps its ID', async () => {
		const editor = await mountEditor();

		moveBlock(editor, 0, 3);

		expect(blocksOf(editor).map(({ id }) => id)).toEqual([second, empty, last, first]);
	});

	it('6. Duplicating a Block gives the copy a new ID', async () => {
		const editor = await mountEditor();

		duplicateBlock(editor, 0);

		const blocks = blocksOf(editor);
		expect(blocks[0]).toMatchObject({ id: first, text: 'The first paragraph.' });
		expect(blocks[1]?.text).toBe('The first paragraph.');
		expectNewId(blocks[1], first, second, empty, last);
	});

	it('7. Cut and paste keeps the IDs of the moved Blocks', async () => {
		const editor = await mountEditor();
		const data = new DataTransfer();
		selectBlocks(editor, 0, 1);
		clipboard(editor, 'cut', data);
		placeCaretAtEnd(editor, blocksOf(editor).length - 1);
		await userEvent.keyboard('{Enter}');

		clipboard(editor, 'paste', data);

		const ids = blocksOf(editor).map(({ id }) => id);
		expect(ids).toContain(first);
		expect(ids).toContain(second);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('7. Copy and paste gives the pasted Blocks new IDs, even before the originals', async () => {
		const editor = await mountEditor();
		const data = new DataTransfer();
		selectBlocks(editor, 2, 3);
		clipboard(editor, 'copy', data);
		placeCaretAtStart(editor, 0);
		await userEvent.keyboard('{Enter}');
		// The caret stays with the content, so it moves up into the new empty Block.
		placeCaretAtStart(editor, 0);

		clipboard(editor, 'paste', data);

		const blocks = blocksOf(editor);
		const copies = blocks.filter(({ text }) => text === 'After an empty paragraph.');
		expect(copies).toHaveLength(2);
		expectNewId(copies[0], first, second, empty, last);
		expect(copies[1]?.id).toBe(last);
		expect(blocks.filter(({ id }) => id === first || id === second)).toHaveLength(2);
		expect(new Set(blocks.map(({ id }) => id)).size).toBe(blocks.length);
	});

	it('8. Undoing a deletion restores the original ID', async () => {
		const editor = await mountEditor({ extensions: [HistoryExtension] });
		selectBlocks(editor, 1, 1);
		await userEvent.keyboard('{Backspace}{Backspace}');
		expect(blocksOf(editor).map(({ id }) => id)).not.toContain(second);

		editor.lexical.dispatchCommand(UNDO_COMMAND, undefined);
		editor.lexical.dispatchCommand(UNDO_COMMAND, undefined);

		expect(blocksOf(editor).map(({ id }) => id)).toEqual([first, second, empty, last]);
	});
});
