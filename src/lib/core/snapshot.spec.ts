import { readdirSync, readFileSync } from 'node:fs';
import { defineExtension } from 'lexical';
import { describe, expect, it } from 'vitest';
import {
	createHeadlessEditor,
	declareSchema,
	exportSnapshot,
	importSnapshot,
	InvalidSnapshotError,
	NewerSchemaVersionError,
	parseSnapshot,
	type Snapshot
} from './index.js';

// Each fixture is one line of compact JSON, as JSON.stringify writes it, plus a newline.
const fixtures = new URL('../../test-fixtures/snapshots/', import.meta.url);
const corpus = readdirSync(fixtures).filter((file) => file.endsWith('.json'));

describe('Snapshot round trip', () => {
	it('has a fixture corpus', () => {
		expect(corpus.length).toBeGreaterThanOrEqual(5);
	});

	it.each(corpus)('%s round-trips byte-identical', (file) => {
		const text = readFileSync(new URL(file, fixtures), 'utf8');
		const editor = createHeadlessEditor();

		importSnapshot(editor, parseSnapshot(JSON.parse(text)));

		expect(`${JSON.stringify(exportSnapshot(editor))}\n`).toBe(text);
	});

	it('records the Schema Version of every Extension that declares one, in key order', () => {
		const Kanban = defineExtension({
			name: 'acme/kanban',
			dependencies: [declareSchema({ name: 'acme/kanban', version: 3 })]
		});
		const editor = createHeadlessEditor({ extensions: [Kanban] });

		expect(Object.entries(exportSnapshot(editor).schema)).toEqual([
			['acme/kanban', 3],
			['core', 1]
		]);
	});
});

describe('importSnapshot', () => {
	const paragraphs = parseSnapshot(
		JSON.parse(readFileSync(new URL('paragraphs.json', fixtures), 'utf8'))
	);
	const withUnknownNode: Snapshot = {
		schema: { core: 1 },
		root: {
			...paragraphs.root,
			children: [...paragraphs.root.children, { type: 'acme/unknown', version: 1 }]
		}
	};

	it('rejects a newer Schema Version and keeps the content', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, paragraphs);

		const newer = { ...paragraphs, schema: { core: 2 } };

		expect(() => importSnapshot(editor, newer)).toThrow(
			expect.objectContaining({
				name: 'NewerSchemaVersionError',
				schema: 'core',
				documentVersion: 2,
				supportedVersion: 1
			})
		);
		expect(() => importSnapshot(editor, newer)).toThrow(NewerSchemaVersionError);
		expect(exportSnapshot(editor)).toEqual(paragraphs);
	});

	it('rejects a Snapshot that Lexical cannot parse and keeps the content', () => {
		const editor = createHeadlessEditor();
		importSnapshot(editor, paragraphs);

		expect(() => importSnapshot(editor, withUnknownNode)).toThrow(InvalidSnapshotError);
		expect(exportSnapshot(editor)).toEqual(paragraphs);
	});

	it('rejects a partly parsed Snapshot when an onError handler does not throw', () => {
		const errors: Error[] = [];
		const LenientErrors = defineExtension({
			name: 'test/lenient-errors',
			onError: (error: Error) => {
				errors.push(error);
			}
		});
		const editor = createHeadlessEditor({ extensions: [LenientErrors] });
		importSnapshot(editor, paragraphs);

		expect(() => importSnapshot(editor, withUnknownNode)).toThrow(InvalidSnapshotError);
		expect(errors).toHaveLength(1);
		expect(exportSnapshot(editor)).toEqual(paragraphs);
	});
});

describe('declareSchema', () => {
	it('accepts schema names that are also Object.prototype properties', () => {
		const Odd = defineExtension({
			name: 'test/odd-names',
			dependencies: [
				declareSchema({ name: 'constructor', version: 1 }),
				declareSchema({ name: 'toString', version: 2 })
			]
		});

		const { schema } = exportSnapshot(createHeadlessEditor({ extensions: [Odd] }));

		expect(Object.entries(schema)).toEqual([
			['constructor', 1],
			['core', 1],
			['toString', 2]
		]);
	});
});

describe('parseSnapshot', () => {
	it.each([
		['a non-object', 'text'],
		['a missing schema map', { root: { type: 'root', children: [] } }],
		[
			'a Schema Version that is not a positive integer',
			{ schema: { core: 1.5 }, root: { type: 'root', children: [] } }
		],
		[
			'a root of the wrong type',
			{ schema: { core: 1 }, root: { type: 'paragraph', children: [] } }
		],
		['a root without children', { schema: { core: 1 }, root: { type: 'root' } }]
	])('rejects %s', (_, value) => {
		expect(() => parseSnapshot(value)).toThrow(InvalidSnapshotError);
	});
});
