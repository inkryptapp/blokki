import type { Provider } from '@lexical/yjs';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import { render } from 'vitest-browser-svelte';
import * as Y from 'yjs';
import { Network, type TestProvider } from '../../test-utils/collab/network.js';
import { placeCaretAtEnd } from '../../test-utils/editor.js';
import { trackResources } from '../../test-utils/resources.js';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import { parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent, type Editor } from '../index.js';
import { collaboration, seedSharedDocument } from './index.js';

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

	it('publishes focus and blur in the awareness state', async () => {
		network = new Network(4);
		const provider = network.join(new Y.Doc());
		seedSharedDocument(provider.doc, parseSnapshot(paragraphs));
		const editor = collaborator(provider, 'Ada');
		await render(EditorContent, { editor, 'aria-label': 'Ada' });
		const focusing = () => provider.awareness.getLocalState()?.focusing;

		expect(focusing()).toBe(false);
		await page.getByRole('textbox', { name: 'Ada' }).click();
		await expect.poll(focusing).toBe(true);
		editor.lexical.blur();
		await expect.poll(focusing).toBe(false);
	});

	it('clears the local presence on pagehide and restores it when the page comes back', async () => {
		network = new Network(5);
		const provider = network.join(new Y.Doc());
		await render(EditorContent, { editor: collaborator(provider, 'Ada'), 'aria-label': 'Ada' });

		const box = page.getByRole('textbox', { name: 'Ada' });
		await box.click();
		await userEvent.keyboard('Hi');
		await expect.poll(() => provider.awareness.getLocalState()?.anchorPos).not.toBeNull();

		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		expect(provider.awareness.getLocalState()).toBeNull();
		window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		expect(provider.awareness.getLocalState()).toMatchObject({ name: 'Ada', focusing: true });
		expect(provider.awareness.getLocalState()?.anchorPos).not.toBeNull();
	});

	it('shows the carets of peers that were present before it mounted', async () => {
		network = new Network(8);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, parseSnapshot(paragraphs));
		const ada = network.join(seeded);
		const grace = network.join(new Y.Doc());
		const first = collaborator(ada, 'Ada');
		await render(EditorContent, { editor: first, 'aria-label': 'Ada' });
		await page.getByRole('textbox', { name: 'Ada' }).click();
		placeCaretAtEnd(first, 0);
		await userEvent.keyboard('!');
		await expect.poll(() => ada.awareness.getLocalState()?.focusing).toBe(true);
		grace.connect();
		network.run();
		expect(grace.awareness.getStates().has(seeded.clientID)).toBe(true);

		await render(EditorContent, { editor: collaborator(grace, 'Grace'), 'aria-label': 'Grace' });

		await expect.element(page.getByText('Ada', { exact: true })).toBeInTheDocument();
	});

	it('moves remote carets when the Editor scrolls', async () => {
		network = new Network(9);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, parseSnapshot(paragraphs));
		const ada = network.join(seeded);
		const grace = network.join(new Y.Doc());
		const first = collaborator(ada, 'Ada');
		await render(EditorContent, { editor: first, 'aria-label': 'Ada' });
		await render(EditorContent, {
			editor: collaborator(grace, 'Grace'),
			'aria-label': 'Grace',
			style: 'height: 3em; overflow: auto; line-height: 1.5em'
		});
		network.run();
		await page.getByRole('textbox', { name: 'Ada' }).click();
		placeCaretAtEnd(first, 3);
		await userEvent.keyboard('!');
		network.run();
		const caret = page.getByText('Ada', { exact: true });
		await expect.element(caret).toBeInTheDocument();
		const before = caret.element().getBoundingClientRect().top;

		const graceBox = page.getByRole('textbox', { name: 'Grace' }).element();
		graceBox.scrollTop = graceBox.scrollHeight;
		graceBox.dispatchEvent(new Event('scroll'));

		await expect.poll(() => caret.element().getBoundingClientRect().top).toBeLessThan(before);
	});

	it('shows a remote caret and removes the presence of a destroyed Editor', async () => {
		network = new Network(6);
		const seeded = new Y.Doc();
		seedSharedDocument(seeded, parseSnapshot(paragraphs));
		const ada = network.join(seeded);
		const grace = network.join(new Y.Doc());
		const first = collaborator(ada, 'Ada');
		const adaView = await render(EditorContent, { editor: first, 'aria-label': 'Ada' });
		await render(EditorContent, { editor: collaborator(grace, 'Grace'), 'aria-label': 'Grace' });
		network.run();

		await page.getByRole('textbox', { name: 'Ada' }).click();
		placeCaretAtEnd(first, 0);
		await userEvent.keyboard('!');
		await expect.poll(() => ada.awareness.getLocalState()?.focusing).toBe(true);
		network.run();

		await expect.element(page.getByText('Ada', { exact: true })).toBeInTheDocument();
		expect(grace.awareness.getStates().has(seeded.clientID)).toBe(true);

		await adaView.unmount();
		network.run();

		expect(grace.awareness.getStates().has(seeded.clientID)).toBe(false);
		await expect.element(page.getByText('Ada', { exact: true })).not.toBeInTheDocument();
	});

	it('leaves no listeners, observers, DOM nodes, or presence behind after 100 mounts', async () => {
		network = new Network(7);
		const doc = new Y.Doc();
		seedSharedDocument(doc, parseSnapshot(paragraphs));
		const provider = network.join(doc);
		const observer = network.join(new Y.Doc());
		observer.connect();
		const target = document.body.appendChild(document.createElement('div'));
		const elementCount = document.querySelectorAll('*').length;
		const docObservers = () =>
			[...doc._observers.values()].reduce((count, listeners) => count + listeners.size, 0);
		const docObserverCount = docObservers();
		const tracker = trackResources();

		try {
			for (let index = 0; index < 100; index += 1) {
				const editor = collaborator(provider, 'Ada');
				const component = mount(EditorContent, { target, props: { editor } });
				flushSync();
				editor.lexical.focus();
				network.run();
				await unmount(component);
				network.run();
			}
		} finally {
			tracker.restore();
		}

		expect(tracker.listeners()).toEqual([]);
		expect(tracker.observers()).toBe(0);
		expect(target.childNodes).toHaveLength(0);
		expect(document.querySelectorAll('*')).toHaveLength(elementCount);
		expect(provider.listenerCount()).toBe(0);
		expect(provider.awarenessListenerCount()).toBe(0);
		expect(docObservers()).toBe(docObserverCount);
		expect(provider.awareness.getLocalState()).toBeNull();
		expect(observer.awareness.getStates().has(doc.clientID)).toBe(false);
		target.remove();
	});
});
