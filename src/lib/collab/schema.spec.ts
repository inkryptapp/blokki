import {
	getExtensionDependencyFromEditor,
	type LexicalEditorWithDispose
} from '@lexical/extension';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	UNDO_COMMAND,
	type AnyLexicalExtensionArgument
} from 'lexical';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Network, type TestProvider } from '../../test-utils/collab/network.js';
import { noteExtension } from '../../test-utils/note.js';
import {
	createHeadlessEditor,
	MissingExtensionError,
	NewerSchemaVersionError,
	parseSnapshot,
	type Snapshot
} from '../core/index.js';
import { SharedDocumentExtension } from '../core/shared-document.js';
import { collaboration, seedSharedDocument } from './index.js';
import { recordedSchemaOf } from './schema-metadata.js';

const note: Snapshot = parseSnapshot({
	schema: { 'acme/note': 2, core: 1 },
	root: {
		type: 'root',
		version: 1,
		direction: null,
		format: '',
		indent: 0,
		children: [
			{
				type: 'acme-note',
				version: 1,
				direction: null,
				format: '',
				indent: 0,
				tone: 'warning',
				children: [
					{
						type: 'paragraph',
						version: 1,
						direction: null,
						format: '',
						indent: 0,
						textFormat: 0,
						textStyle: '',
						children: [
							{
								type: 'text',
								version: 1,
								detail: 0,
								format: 0,
								mode: 'normal',
								style: '',
								text: 'Mind the gap.'
							}
						]
					}
				]
			}
		]
	}
});

interface Peer {
	readonly editor: LexicalEditorWithDispose;
	readonly provider: TestProvider;
	readonly writes: Uint8Array[];
}

function join(network: Network, doc: Y.Doc, extensions: AnyLexicalExtensionArgument[]): Peer {
	const provider = network.join(doc);
	const user = { id: `user-${doc.clientID}`, name: 'User' };
	const editor = createHeadlessEditor({
		extensions: [...extensions, collaboration({ doc, provider, user })]
	});
	const writes: Uint8Array[] = [];
	doc.on('update', (update: Uint8Array, origin: unknown) => {
		if (origin !== provider) {
			writes.push(update);
		}
	});
	provider.connect();
	return { editor, provider, writes };
}

function upgradeRequiredOf(peer: Peer) {
	return getExtensionDependencyFromEditor(peer.editor, SharedDocumentExtension).output
		.upgradeRequired.value;
}

function write(peer: Peer, text: string): void {
	peer.editor.update(
		() => {
			$getRoot().append($createParagraphNode().append($createTextNode(text)));
		},
		{ discrete: true }
	);
}

const schemaOf = (doc: Y.Doc) => recordedSchemaOf(doc);

describe('the schema metadata of a Shared Document', () => {
	it('is written by Seeding', () => {
		const doc = new Y.Doc();

		seedSharedDocument(doc, note, { extensions: [noteExtension(2)] });

		expect(schemaOf(doc)).toEqual({ 'acme/note': 2, core: 1 });
	});

	it('is raised by a newer client on its first write, not on connect', () => {
		const network = new Network(1);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, note, { extensions: [noteExtension(2)] });
		const newer = join(network, seeded, [noteExtension(3)]);
		network.run();

		expect(schemaOf(seeded)).toEqual({ 'acme/note': 2, core: 1 });
		write(newer, 'Written by newer code.');
		expect(schemaOf(seeded)).toEqual({ 'acme/note': 3, core: 1 });
		network.destroy();
	});
});

describe('concurrent raises', () => {
	it.each([
		[1, 2],
		[2, 1]
	])('converge on the highest version with client IDs %i and %i', (first, second) => {
		const network = new Network(6);
		const seeded = new Y.Doc();
		seedSharedDocument(
			seeded,
			{ ...note, schema: { 'acme/note': 1, core: 1 } },
			{
				extensions: [noteExtension(1)]
			}
		);
		const docA = new Y.Doc();
		docA.clientID = first;
		const docB = new Y.Doc();
		docB.clientID = second;
		join(network, seeded, [noteExtension(1)]);
		const a = join(network, docA, [noteExtension(2)]);
		const b = join(network, docB, [noteExtension(3)]);
		network.run();

		network.partition([[a.provider], [b.provider]]);
		write(a, 'From version 2.');
		write(b, 'From version 3.');
		network.settle();

		expect(schemaOf(docA)).toMatchObject({ 'acme/note': 3 });
		expect(schemaOf(docB)).toMatchObject({ 'acme/note': 3 });
		expect(a.editor.isEditable()).toBe(false);
		expect(b.editor.isEditable()).toBe(true);
		network.destroy();
	});

	it('keep the highest version when the newer writer leaves before they merge', () => {
		const network = new Network(7);
		const seeded = new Y.Doc();
		seedSharedDocument(
			seeded,
			{ ...note, schema: { 'acme/note': 1, core: 1 } },
			{
				extensions: [noteExtension(1)]
			}
		);
		const docA = new Y.Doc();
		docA.clientID = 2;
		const docB = new Y.Doc();
		docB.clientID = 1;
		const a = join(network, docA, [noteExtension(2)]);
		const b = join(network, docB, [noteExtension(3)]);
		join(network, seeded, [noteExtension(1)]);
		network.run();

		network.partition([[a.provider], [b.provider]]);
		write(a, 'From version 2.');
		write(b, 'From version 3.');
		b.editor.dispose();
		b.provider.disconnect();
		Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

		expect(schemaOf(docA)).toMatchObject({ 'acme/note': 3 });
		expect(a.editor.isEditable()).toBe(false);
		network.destroy();
	});
});

describe('an older client', () => {
	it('opens a Shared Document with a newer Schema Version read-only and reports it', () => {
		const network = new Network(2);
		const doc = new Y.Doc();
		seedSharedDocument(doc, note, { extensions: [noteExtension(3)] });
		const older = join(network, doc, [noteExtension(2)]);

		expect(older.editor.isEditable()).toBe(false);
		expect(upgradeRequiredOf(older)).toBeInstanceOf(NewerSchemaVersionError);
		expect(upgradeRequiredOf(older)).toMatchObject({
			schema: 'acme/note',
			documentVersion: 3,
			supportedVersion: 2
		});
		expect(older.editor.read(() => $getRoot().getTextContent())).toBe('Mind the gap.');
		network.destroy();
	});

	it('switches to read-only when a newer client raises a Schema Version', () => {
		const network = new Network(3);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, note, { extensions: [noteExtension(2)] });
		const older = join(network, seeded, [noteExtension(2)]);
		const newer = join(network, new Y.Doc(), [noteExtension(3)]);
		network.run();
		expect(older.editor.isEditable()).toBe(true);

		write(newer, 'Written by newer code.');
		network.run();

		expect(older.editor.isEditable()).toBe(false);
		expect(upgradeRequiredOf(older)).toMatchObject({ schema: 'acme/note', documentVersion: 3 });
		expect(older.editor.read(() => $getRoot().getTextContent())).toContain(
			'Written by newer code.'
		);
		network.destroy();
	});

	it('never writes to the Shared Document while it is read-only for a schema reason', () => {
		const network = new Network(4);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, note, { extensions: [noteExtension(2)] });
		const older = join(network, seeded, [noteExtension(2)]);
		const newer = join(network, new Y.Doc(), [noteExtension(3)]);
		network.run();
		write(older, 'Before the upgrade.');
		write(newer, 'Written by newer code.');
		network.run();
		const writes = older.writes.length;

		write(older, 'After the upgrade.');
		older.editor.dispatchCommand(UNDO_COMMAND, undefined);
		older.editor.update(() => $getRoot().clear(), { discrete: true });
		network.run();

		expect(older.writes).toHaveLength(writes);
		expect(newer.editor.read(() => $getRoot().getTextContent())).not.toContain(
			'After the upgrade.'
		);
		expect(newer.editor.read(() => $getRoot().getTextContent())).toContain('Before the upgrade.');
		network.destroy();
	});
});

describe('a client that lacks an Extension the document uses', () => {
	it('opens it read-only, reports it, and leaves the content untouched', () => {
		const network = new Network(5);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, note, { extensions: [noteExtension(2)] });
		const content = seeded.get('root-v2', Y.XmlElement).toString();
		const lacking = join(network, new Y.Doc(), []);
		join(network, seeded, [noteExtension(2)]);

		network.run();
		write(lacking, 'Ignored.');
		network.run();

		expect(lacking.editor.isEditable()).toBe(false);
		expect(upgradeRequiredOf(lacking)).toBeInstanceOf(MissingExtensionError);
		expect(upgradeRequiredOf(lacking)).toMatchObject({ schema: 'acme/note', documentVersion: 2 });
		expect(lacking.writes).toHaveLength(0);
		expect(seeded.get('root-v2', Y.XmlElement).toString()).toBe(content);
		network.destroy();
	});
});
