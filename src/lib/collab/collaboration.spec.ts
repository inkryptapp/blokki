import { readFileSync } from 'node:fs';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { HistoryExtension } from '@lexical/history';
import { initLocalState } from '@lexical/yjs';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	REDO_COMMAND,
	UNDO_COMMAND,
	type LexicalEditor
} from 'lexical';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Network } from '../../test-utils/collab/network.js';
import { createHeadlessEditor, exportSnapshot, parseSnapshot } from '../core/index.js';
import { createEditor } from '../index.js';
import { collaboration, CollaborationExtension, seedSharedDocument } from './index.js';

const paragraphs = parseSnapshot(
	JSON.parse(
		readFileSync(new URL('../../test-fixtures/snapshots/paragraphs.json', import.meta.url), 'utf8')
	)
);

describe('a headless collaborative editor', () => {
	it('reads the Shared Document while a remote user has a caret in it', () => {
		const network = new Network(1);
		const doc = new Y.Doc();
		seedSharedDocument(doc, paragraphs);
		const local = network.join(doc);
		const remote = network.join(new Y.Doc());
		local.connect();
		remote.connect();
		network.run();
		const firstParagraph = remote.doc.get('root-v2', Y.XmlElement).get(0);
		const text = firstParagraph instanceof Y.XmlElement ? firstParagraph.get(0) : null;
		if (!(text instanceof Y.XmlText)) {
			throw new Error('The seeded document has no text.');
		}
		initLocalState(remote, 'Grace', 'red', true, {});
		const position = Y.createRelativePositionFromTypeIndex(text, 2);
		remote.awareness.setLocalStateField('anchorPos', position);
		remote.awareness.setLocalStateField('focusPos', position);
		network.run();
		expect(local.awareness.getStates().size).toBe(2);

		const user = { id: 'ada', name: 'Ada' };
		const headless = createHeadlessEditor({
			extensions: [collaboration({ doc, provider: local, user })]
		});
		const editor = createEditor({ extensions: [collaboration({ doc, provider: local, user })] });

		expect(exportSnapshot(headless)).toEqual(paragraphs);
		expect(editor.getSnapshot()).toEqual(paragraphs);
		headless.dispose();
		network.destroy();
	});
});

function joinHeadless(network: Network, doc: Y.Doc, name: string) {
	const provider = network.join(doc);
	const user = { id: name.toLowerCase(), name };
	const editor = createHeadlessEditor({ extensions: [collaboration({ doc, provider, user })] });
	provider.connect();
	return { editor, provider };
}

function undoManagerOf(editor: LexicalEditor) {
	return getExtensionDependencyFromEditor(editor, CollaborationExtension).output.undoManager;
}

function appendParagraph(editor: LexicalEditor, text: string): void {
	editor.update(
		() => {
			$getRoot().append($createParagraphNode().append($createTextNode(text)));
		},
		{ discrete: true }
	);
	// Ends the undo step, so the next edit is a separate one.
	undoManagerOf(editor).stopCapturing();
}

describe('Seeding', () => {
	it('puts a Snapshot in a new Shared Document exactly once for every connected Editor', () => {
		const network = new Network(2);
		const doc = new Y.Doc();
		seedSharedDocument(doc, paragraphs);
		const peers = [
			joinHeadless(network, doc, 'Ada'),
			joinHeadless(network, new Y.Doc(), 'Grace'),
			joinHeadless(network, new Y.Doc(), 'Alan')
		];

		network.run();

		for (const { editor } of peers) {
			expect(exportSnapshot(editor)).toEqual(paragraphs);
			editor.dispose();
		}
		network.destroy();
	});

	it('refuses a Snapshot with node types that its Extensions do not have', () => {
		const doc = new Y.Doc();
		const unsupported = parseSnapshot(
			JSON.parse(
				readFileSync(
					new URL('../../test-fixtures/snapshots/unsupported-nodes.json', import.meta.url),
					'utf8'
				)
			)
		);

		expect(() => seedSharedDocument(doc, unsupported)).toThrow('acme-kanban');
		expect(doc.get('root-v2', Y.XmlElement).length).toBe(0);
	});

	it('refuses a Shared Document that already has content', () => {
		const doc = new Y.Doc();
		seedSharedDocument(doc, paragraphs);

		expect(() => seedSharedDocument(doc, paragraphs)).toThrow('already has content');
	});

	it('is not an undo step', () => {
		const network = new Network(3);
		const doc = new Y.Doc();
		seedSharedDocument(doc, paragraphs);
		const { editor } = joinHeadless(network, doc, 'Ada');

		expect(undoManagerOf(editor).undoStack).toHaveLength(0);
		editor.dispatchCommand(UNDO_COMMAND, undefined);

		expect(exportSnapshot(editor)).toEqual(paragraphs);
		editor.dispose();
		network.destroy();
	});
});

describe('an Editor that connects to an empty Shared Document', () => {
	it('does not seed it', () => {
		const network = new Network(4);
		const empty = joinHeadless(network, new Y.Doc(), 'Ada');
		const other = joinHeadless(network, new Y.Doc(), 'Grace');
		const updates: Uint8Array[] = [];
		empty.provider.doc.on('update', (update: Uint8Array) => updates.push(update));

		network.run();
		exportSnapshot(empty.editor);

		expect(updates).toEqual([]);
		expect(empty.provider.doc.get('root-v2', Y.XmlElement).length).toBe(0);
		expect(other.provider.doc.get('root-v2', Y.XmlElement).length).toBe(0);
		empty.editor.dispose();
		other.editor.dispose();
		network.destroy();
	});
});

describe('undo with collaboration', () => {
	it("reverts only the local user's edits", () => {
		const network = new Network(5);
		const doc = new Y.Doc();
		seedSharedDocument(doc, paragraphs);
		const ada = joinHeadless(network, doc, 'Ada');
		const grace = joinHeadless(network, new Y.Doc(), 'Grace');
		network.run();

		appendParagraph(ada.editor, 'by Ada');
		network.run();
		appendParagraph(grace.editor, 'by Grace');
		network.run();
		ada.editor.dispatchCommand(UNDO_COMMAND, undefined);
		network.run();

		for (const { editor } of [ada, grace]) {
			expect(editor.read(() => $getRoot().getTextContent())).toContain('by Grace');
			expect(editor.read(() => $getRoot().getTextContent())).not.toContain('by Ada');
		}

		grace.editor.dispatchCommand(UNDO_COMMAND, undefined);
		network.run();

		for (const { editor } of [ada, grace]) {
			expect(exportSnapshot(editor)).toEqual(paragraphs);
		}
		ada.editor.dispose();
		grace.editor.dispose();
		network.destroy();
	});

	it('keeps redo working after an undo empties the Shared Document', () => {
		const network = new Network(7);
		const { editor, provider } = joinHeadless(network, new Y.Doc(), 'Ada');

		appendParagraph(editor, 'first words');
		editor.dispatchCommand(UNDO_COMMAND, undefined);
		exportSnapshot(editor);

		expect(undoManagerOf(editor).redoStack).toHaveLength(1);
		editor.dispatchCommand(REDO_COMMAND, undefined);

		expect(editor.read(() => $getRoot().getTextContent())).toContain('first words');
		expect(provider.doc.get('root-v2', Y.XmlElement).toString()).toContain('first words');
		editor.dispose();
		network.destroy();
	});

	it('cannot be combined with the History Extension', () => {
		const doc = new Y.Doc();
		const network = new Network(6);
		const provider = network.join(doc);

		expect(() =>
			createHeadlessEditor({
				extensions: [
					HistoryExtension,
					collaboration({ doc, provider, user: { id: 'a', name: 'A' } })
				]
			})
		).toThrow('conflicts with');
		network.destroy();
	});
});
