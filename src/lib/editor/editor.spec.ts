import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noteExtension } from '../../test-utils/note.js';
import { parseSnapshot } from '../core/index.js';
import { createEditor } from '../index.js';

describe('createEditor', () => {
	it('configures an Editor without a DOM', () => {
		expect(typeof document).toBe('undefined');

		const editor = createEditor({ extensions: [] });

		expect(() => editor.lexical).toThrow('The Editor is not mounted.');
	});

	it('returns its content as a Snapshot before it mounts', () => {
		const text = readFileSync(
			new URL('../../test-fixtures/snapshots/paragraphs.json', import.meta.url),
			'utf8'
		);
		const editor = createEditor({ content: parseSnapshot(JSON.parse(text)) });

		expect(`${JSON.stringify(editor.getSnapshot())}\n`).toBe(text);
	});

	it('returns one empty paragraph without content', () => {
		const snapshot = createEditor().getSnapshot();

		expect(snapshot.schema).toEqual({ core: 1 });
		expect(snapshot.root.children).toMatchObject([{ type: 'paragraph', children: [] }]);
	});

	it('runs pending Migrations when it exports unmounted content', () => {
		const content = parseSnapshot({
			schema: { 'acme/note': 1, core: 1 },
			root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [] }
		});
		const editor = createEditor({ content, extensions: [noteExtension(3)] });

		expect(editor.getSnapshot().schema).toEqual({ 'acme/note': 3, core: 1 });
	});

	it('returns unmounted content with a newer Schema Version unchanged', () => {
		const newer = parseSnapshot({
			schema: { 'acme/note': 3, core: 1 },
			root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [] }
		});
		const editor = createEditor({ content: newer, extensions: [noteExtension(2)] });

		expect(editor.getSnapshot()).toBe(newer);
	});
});
