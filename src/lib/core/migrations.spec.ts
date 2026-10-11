import { defineExtension, type SerializedLexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';
import { noteExtension } from '../../test-utils/note.js';
import {
	createHeadlessEditor,
	declareSchema,
	exportSnapshot,
	importSnapshot,
	NewerSchemaVersionError,
	type Snapshot
} from './index.js';

const paragraph = (text: string) => ({
	type: 'paragraph',
	version: 1,
	direction: null,
	format: '',
	indent: 0,
	textFormat: 0,
	textStyle: '',
	children: [{ type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }]
});

const note = (fields: Record<string, string>, text: string) => ({
	type: 'acme-note',
	version: 1,
	direction: null,
	format: '',
	indent: 0,
	...fields,
	children: [paragraph(text)]
});

const snapshotAt = (version: number, ...children: SerializedLexicalNode[]): Snapshot => ({
	schema: { 'acme/note': version, core: 1 },
	root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children }
});

const version1 = snapshotAt(
	1,
	note({ color: 'yellow' }, 'Mind the gap.'),
	note({ color: 'blue' }, 'Doors open on the left.')
);

describe('Migrations', () => {
	it('upgrade a version 1 Snapshot to version 2 on import', () => {
		const editor = createHeadlessEditor({ extensions: [noteExtension(2)] });

		importSnapshot(editor, version1);

		expect(exportSnapshot(editor)).toEqual(
			snapshotAt(
				2,
				note({ tone: 'warning' }, 'Mind the gap.'),
				note({ tone: 'info' }, 'Doors open on the left.')
			)
		);
	});

	it('run a chain from version 1 to 2 to 3 in order', () => {
		const editor = createHeadlessEditor({ extensions: [noteExtension(3)] });

		importSnapshot(editor, version1);

		expect(exportSnapshot(editor)).toEqual(
			snapshotAt(
				3,
				note({ tone: 'warning', icon: '⚠️' }, 'Mind the gap.'),
				note({ tone: 'info', icon: 'ℹ️' }, 'Doors open on the left.')
			)
		);
	});

	it('start from the version that the Snapshot records', () => {
		const editor = createHeadlessEditor({ extensions: [noteExtension(3)] });

		importSnapshot(editor, snapshotAt(2, note({ tone: 'warning' }, 'Mind the gap.')));

		expect(exportSnapshot(editor)).toEqual(
			snapshotAt(3, note({ tone: 'warning', icon: '⚠️' }, 'Mind the gap.'))
		);
	});

	it('leave the imported Snapshot unchanged', () => {
		const original = structuredClone(version1);

		importSnapshot(createHeadlessEditor({ extensions: [noteExtension(3)] }), version1);

		expect(version1).toEqual(original);
	});

	it('must exist for every version bump', () => {
		const Incomplete = defineExtension({
			name: 'test/incomplete',
			dependencies: [
				declareSchema({ name: 'test/incomplete', version: 3, migrations: { 3: (root) => root } })
			]
		});

		expect(() => createHeadlessEditor({ extensions: [Incomplete] })).toThrow(
			'Schema "test/incomplete" has no Migration to version 2.'
		);
	});
});

describe('a Snapshot with a newer Schema Version', () => {
	it('is never downgraded by the headless import', () => {
		const editor = createHeadlessEditor({ extensions: [noteExtension(2)] });

		expect(() =>
			importSnapshot(editor, snapshotAt(3, note({ tone: 'info', icon: 'ℹ️' }, 'Later.')))
		).toThrow(NewerSchemaVersionError);
	});
});
