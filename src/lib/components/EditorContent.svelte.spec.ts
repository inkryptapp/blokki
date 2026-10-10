import { defineExtension } from 'lexical';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { textOf } from '../../test-utils/editor.js';
import { trackResources } from '../../test-utils/resources.js';
import { createEditor, EditorContent } from '../index.js';

describe('EditorContent', () => {
	it('accepts typing into a mounted Editor', async () => {
		const editor = createEditor();
		await render(EditorContent, { editor, 'aria-label': 'Document' });
		const textbox = page.getByRole('textbox', { name: 'Document' });

		await textbox.click();
		await userEvent.keyboard('Hello');

		await expect.element(textbox).toHaveTextContent('Hello');
		expect(textOf(editor)).toBe('Hello');
	});

	it('exposes the Lexical editor attached to its root element', async () => {
		const editor = createEditor();
		await render(EditorContent, { editor, 'aria-label': 'Document' });

		const root = page.getByRole('textbox', { name: 'Document' }).element();

		expect(editor.lexical.getRootElement()).toBe(root);
		expect(root.getAttribute('contenteditable')).toBe('true');
	});

	it('keeps two Editors on one page independent', async () => {
		const first = createEditor();
		const second = createEditor();
		await render(EditorContent, { editor: first, 'aria-label': 'First' });
		await render(EditorContent, { editor: second, 'aria-label': 'Second' });

		await page.getByRole('textbox', { name: 'First' }).click();
		await userEvent.keyboard('one');
		await page.getByRole('textbox', { name: 'Second' }).click();
		await userEvent.keyboard('two');

		await expect.element(page.getByRole('textbox', { name: 'First' })).toHaveTextContent('one');
		await expect.element(page.getByRole('textbox', { name: 'Second' })).toHaveTextContent('two');
		expect(textOf(first)).toBe('one');
		expect(textOf(second)).toBe('two');
	});

	it('replaces the skeleton with the Editor once it mounts', async () => {
		const skeleton = createRawSnippet(() => ({
			render: () => '<p data-testid="skeleton">Loading the document</p>'
		}));
		await render(EditorContent, { editor: createEditor(), skeleton, 'aria-label': 'Document' });

		await expect.element(page.getByRole('textbox', { name: 'Document' })).toBeInTheDocument();
		await expect.element(page.getByTestId('skeleton')).not.toBeInTheDocument();
	});

	it('leaves no listeners, observers, or DOM nodes behind after 100 mounts', async () => {
		const target = document.body.appendChild(document.createElement('div'));
		const elementCount = document.querySelectorAll('*').length;
		const signals: AbortSignal[] = [];
		let cleanups = 0;
		const probe = defineExtension({
			name: 'test/probe',
			register: (_editor, _config, state) => {
				signals.push(state.getSignal());
				document.addEventListener('keydown', () => {}, { signal: state.getSignal() });
				return () => {
					cleanups += 1;
				};
			}
		});
		const tracker = trackResources();

		try {
			for (let index = 0; index < 100; index += 1) {
				const editor = createEditor({ extensions: [probe] });
				const component = mount(EditorContent, { target, props: { editor } });
				flushSync();
				editor.lexical.focus();
				await unmount(component);
			}
		} finally {
			tracker.restore();
		}

		expect(tracker.listeners()).toEqual([]);
		expect(tracker.observers()).toBe(0);
		expect(target.childNodes).toHaveLength(0);
		expect(document.querySelectorAll('*')).toHaveLength(elementCount);
		expect(cleanups).toBe(100);
		expect(signals.filter((signal) => !signal.aborted)).toEqual([]);
		target.remove();
	});
});
