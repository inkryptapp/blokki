import type { Provider } from '@lexical/yjs';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import * as Y from 'yjs';
import { Network, type TestProvider } from '../../test-utils/collab/network.js';
import { placeCaretAtEnd } from '../../test-utils/editor.js';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import { parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent, type Editor } from '../index.js';
import { collaboration } from './index.js';
import { seedSharedDocument } from './seed.js';

let network: Network | undefined;

afterEach(() => {
	network?.destroy();
	network = undefined;
});

function collaborator(provider: TestProvider, name: string): Editor {
	const user = { id: name.toLowerCase(), name };
	return createEditor({ extensions: [collaboration({ doc: provider.doc, provider, user })] });
}

describe('collaboration', () => {
	it('keeps two mounted Editors in sync', async () => {
		network = new Network(1);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, parseSnapshot(paragraphs));
		const ada = network.join(seeded);
		const grace = network.join(new Y.Doc());
		const first = collaborator(ada, 'Ada');
		const second = collaborator(grace, 'Grace');
		await render(EditorContent, { editor: first, 'aria-label': 'Ada' });
		await render(EditorContent, { editor: second, 'aria-label': 'Grace' });
		const adaBox = page.getByRole('textbox', { name: 'Ada' });
		const graceBox = page.getByRole('textbox', { name: 'Grace' });

		network.run();
		await expect.element(graceBox).toHaveTextContent('The first paragraph.');

		await adaBox.click();
		placeCaretAtEnd(first, 0);
		await userEvent.keyboard(' from Ada');
		await expect.element(adaBox).toHaveTextContent('The first paragraph. from Ada');
		network.run();
		await expect.element(graceBox).toHaveTextContent('The first paragraph. from Ada');

		await graceBox.click();
		placeCaretAtEnd(second, 3);
		await userEvent.keyboard(' from Grace');
		await expect.element(graceBox).toHaveTextContent('After an empty paragraph. from Grace');
		network.run();
		await expect.element(adaBox).toHaveTextContent('After an empty paragraph. from Grace');

		expect(JSON.stringify(second.getSnapshot())).toBe(JSON.stringify(first.getSnapshot()));
	});

	it('connects the provider while mounted and disconnects it on unmount', async () => {
		network = new Network(2);
		const provider = network.join(new Y.Doc());
		const editor = collaborator(provider, 'Ada');

		const { unmount } = await render(EditorContent, { editor, 'aria-label': 'Ada' });

		expect(provider.connected).toBe(true);
		await unmount();
		expect(provider.connected).toBe(false);
		expect(provider.listenerCount()).toBe(0);
	});

	it('does not import the content option into a Shared Document', async () => {
		network = new Network(3);
		const provider = network.join(new Y.Doc());
		const user = { id: 'ada', name: 'Ada' };
		const editor = createEditor({
			content: parseSnapshot(paragraphs),
			extensions: [collaboration({ doc: provider.doc, provider, user })]
		});

		await render(EditorContent, { editor, 'aria-label': 'Ada' });

		expect(provider.doc.get('root-v2', Y.XmlElement).length).toBe(0);
		await expect
			.element(page.getByRole('textbox', { name: 'Ada' }))
			.not.toHaveTextContent('The first paragraph.');
	});

	it('is not disconnected by an earlier mount whose connect() settles late', async () => {
		const settlers: (() => void)[] = [];
		let connected = false;
		const provider: Provider = {
			awareness: {
				getLocalState: () => null,
				getStates: () => new Map(),
				on: () => {},
				off: () => {},
				setLocalState: () => {},
				setLocalStateField: () => {}
			},
			connect: () =>
				new Promise<void>((resolve) => {
					settlers.push(() => {
						connected = true;
						resolve();
					});
				}),
			disconnect: () => {
				connected = false;
			},
			on: () => {},
			off: () => {}
		};
		const user = { id: 'ada', name: 'Ada' };
		const editor = createEditor({
			extensions: [collaboration({ doc: new Y.Doc(), provider, user })]
		});

		const first = await render(EditorContent, { editor, 'aria-label': 'First' });
		await first.unmount();
		await render(EditorContent, { editor, 'aria-label': 'Second' });
		for (const settle of settlers) {
			settle();
		}
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(settlers).toHaveLength(2);
		expect(connected).toBe(true);
	});
});
