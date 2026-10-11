import { readFileSync } from 'node:fs';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type SerializedLexicalNode
} from 'lexical';
import { describe, expect, it } from 'vitest';
import {
	$getBlockId,
	createBlockId,
	createHeadlessEditor,
	exportSnapshot,
	importSnapshot,
	parseSnapshot
} from './index.js';

const BLOCK_ID = /^[A-Za-z0-9_-]{10}$/;

const paragraphs = parseSnapshot(
	JSON.parse(
		readFileSync(new URL('../../test-fixtures/snapshots/paragraphs.json', import.meta.url), 'utf8')
	)
);

const blockIdOf = (node: SerializedLexicalNode | undefined): unknown =>
	node?.$ === undefined ? undefined : node.$['blockId'];

describe('createBlockId', () => {
	it('returns 10 characters from a URL-safe alphabet', () => {
		const ids = Array.from({ length: 1000 }, () => createBlockId());

		for (const id of ids) {
			expect(id).toMatch(BLOCK_ID);
		}
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('Block IDs', () => {
	it('are given to every paragraph the moment it is created', () => {
		const editor = createHeadlessEditor();

		editor.update(
			() => {
				const paragraph = $createParagraphNode().append($createTextNode('New.'));
				$getRoot().append(paragraph);
			},
			{ discrete: true }
		);

		const { root } = exportSnapshot(editor);
		expect(root.children).toHaveLength(2);
		for (const child of root.children) {
			expect(blockIdOf(child)).toMatch(BLOCK_ID);
		}
	});

	it('survive a Snapshot round trip unchanged', () => {
		const editor = createHeadlessEditor();

		importSnapshot(editor, paragraphs);

		expect(exportSnapshot(editor).root.children.map(blockIdOf)).toEqual(
			paragraphs.root.children.map(blockIdOf)
		);
	});

	it('are added to imported paragraphs that have none', () => {
		const editor = createHeadlessEditor();
		const withoutIds = {
			...paragraphs,
			root: {
				...paragraphs.root,
				children: paragraphs.root.children.map(({ $: _state, ...node }) => node)
			}
		};

		importSnapshot(editor, withoutIds);

		const ids = exportSnapshot(editor).root.children.map(blockIdOf);
		expect(ids.every((id) => typeof id === 'string' && BLOCK_ID.test(id))).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('are repaired when two Blocks share one: the later Block gets a new ID', () => {
		const editor = createHeadlessEditor();
		const [first, second, ...rest] = paragraphs.root.children;
		if (first === undefined || second === undefined) {
			throw new Error('The fixture needs two paragraphs.');
		}
		const duplicate = { ...second, $: { blockId: blockIdOf(first) } };

		importSnapshot(editor, {
			...paragraphs,
			root: { ...paragraphs.root, children: [first, duplicate, ...rest] }
		});

		const ids = exportSnapshot(editor).root.children.map(blockIdOf);
		expect(ids[0]).toBe(blockIdOf(first));
		expect(ids[1]).not.toBe(blockIdOf(first));
		expect(ids[1]).toMatch(BLOCK_ID);
		expect(ids.slice(2)).toEqual(rest.map(blockIdOf));
	});

	it('can be read with $getBlockId', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, paragraphs);

		const ids = editor.read(() => $getRoot().getChildren().map($getBlockId));

		expect(ids).toEqual(paragraphs.root.children.map(blockIdOf));
	});
});
