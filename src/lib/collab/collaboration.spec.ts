import { readFileSync } from 'node:fs';
import { initLocalState } from '@lexical/yjs';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Network } from '../../test-utils/collab/network.js';
import { createHeadlessEditor, exportSnapshot, parseSnapshot } from '../core/index.js';
import { createEditor } from '../index.js';
import { collaboration } from './index.js';
import { seedSharedDocument } from './seed.js';

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
