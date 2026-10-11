import { readFileSync } from 'node:fs';
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode } from 'lexical';
import { describe, expect, it } from 'vitest';
import { createHeadlessEditor, exportSnapshot, importSnapshot, parseSnapshot } from './index.js';

const snapshot = parseSnapshot(
	JSON.parse(
		readFileSync(
			new URL('../../test-fixtures/snapshots/unsupported-nodes.json', import.meta.url),
			'utf8'
		)
	)
);
const [, kanban, pingParagraph] = snapshot.root.children;
const mention =
	pingParagraph !== undefined && 'children' in pingParagraph ? pingParagraph.children : [];

describe('Unsupported Blocks', () => {
	it('stand in for node types whose Extension is not enabled', () => {
		const editor = createHeadlessEditor();

		importSnapshot(editor, snapshot);

		const types = editor.read(() =>
			$getRoot()
				.getChildren()
				.map((node) => [
					node.getType(),
					...($isElementNode(node) ? node.getChildren().map((child) => child.getType()) : [])
				])
		);
		expect(types).toEqual([
			['paragraph', 'text'],
			['blokki-unsupported-block'],
			['paragraph', 'text', 'blokki-unsupported-inline', 'text'],
			['paragraph', 'text']
		]);
	});

	it('export the original JSON and keep the schema entries of disabled Extensions', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, snapshot);

		editor.update(
			() => {
				$getRoot().append($createParagraphNode().append($createTextNode('Added later.')));
			},
			{ discrete: true }
		);
		const exported = exportSnapshot(editor);

		expect(exported.schema).toEqual({ 'acme/kanban': 3, 'acme/mention': 1, core: 1 });
		expect(exported.root.children[1]).toEqual(kanban);
		expect(exported.root.children[2]).toEqual(pingParagraph);
		expect(mention).toContainEqual(expect.objectContaining({ type: 'acme-mention' }));
		expect(exported.root.children).toHaveLength(5);
	});

	it('keep only the schema entries of the last import', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, snapshot);

		importSnapshot(editor, {
			...snapshot,
			schema: { core: 1 },
			root: { ...snapshot.root, children: [] }
		});

		expect(exportSnapshot(editor).schema).toEqual({ core: 1 });
	});

	it('have their schema entries in place when update listeners export during an import', () => {
		const editor = createHeadlessEditor();
		const seen: string[][] = [];
		editor.registerUpdateListener(() => {
			seen.push(Object.keys(exportSnapshot(editor).schema));
		});

		importSnapshot(editor, snapshot);

		expect(seen.at(-1)).toEqual(['acme/kanban', 'acme/mention', 'core']);
	});

	it('keep their schema entries when an import fails', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, snapshot);

		expect(() =>
			importSnapshot(
				editor,
				parseSnapshot({
					schema: { core: 1 },
					root: { ...snapshot.root, children: [{ version: 1 }] }
				})
			)
		).toThrow();
		expect(exportSnapshot(editor).schema).toEqual(snapshot.schema);
	});

	it('are detached from the Snapshots that go in and come out', () => {
		const input = structuredClone(snapshot);
		const editor = createHeadlessEditor();
		importSnapshot(editor, input);

		const exported = exportSnapshot(editor);
		Reflect.set(exported.root.children[1] ?? {}, 'columns', []);
		Reflect.set(input.root.children[1] ?? {}, 'columns', []);

		expect(exportSnapshot(editor).root.children[1]).toEqual(kanban);
	});

	it('keep the schema entry of a disabled Extension named like an Object.prototype property', () => {
		const editor = createHeadlessEditor();

		importSnapshot(editor, { ...snapshot, schema: { ...snapshot.schema, constructor: 2 } });

		expect(exportSnapshot(editor).schema).toEqual({ ...snapshot.schema, constructor: 2 });
	});
});
