import { defineExtension } from 'lexical';
import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import formattedText from '../../test-fixtures/snapshots/formatted-text.json';
import headingsAndQuote from '../../test-fixtures/snapshots/headings-and-quote.json';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import { parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent } from '../index.js';

describe('Editor snapshots', () => {
	it.each([
		['paragraphs', paragraphs, 'The first paragraph.'],
		['formatted-text', formattedText, 'bold italic'],
		['headings-and-quote', headingsAndQuote, 'A quotation.']
	])('shows the %s Snapshot and exports it unchanged', async (_, fixture, visibleText) => {
		const content = parseSnapshot(fixture);
		const editor = createEditor({ content });
		await render(EditorContent, { editor, 'aria-label': 'Document' });

		await expect
			.element(page.getByRole('textbox', { name: 'Document' }))
			.toHaveTextContent(visibleText);
		expect(JSON.stringify(editor.getSnapshot())).toBe(JSON.stringify(content));
	});

	it('exports a schema map and the typed content', async () => {
		const editor = createEditor();
		await render(EditorContent, { editor, 'aria-label': 'Document' });

		await page.getByRole('textbox', { name: 'Document' }).click();
		await userEvent.keyboard('Hello');

		await expect
			.element(page.getByRole('textbox', { name: 'Document' }))
			.toHaveTextContent('Hello');
		const snapshot = editor.getSnapshot();
		expect(snapshot.schema).toEqual({ core: 1 });
		expect(snapshot.root.type).toBe('root');
		expect(snapshot.root.children).toMatchObject([
			{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] }
		]);
	});

	it('keeps its content while unmounted and shows it again on the next mount', async () => {
		const target = document.body.appendChild(document.createElement('div'));
		const editor = createEditor();
		const first = mount(EditorContent, { target, props: { editor } });
		flushSync();
		await userEvent.click(target.querySelector('[role="textbox"]') ?? target);
		await userEvent.keyboard('Kept');
		await expect.element(page.getByText('Kept')).toBeInTheDocument();
		await unmount(first);

		const exported = editor.getSnapshot();
		const second = mount(EditorContent, { target, props: { editor } });
		flushSync();

		expect(exported.root.children).toMatchObject([{ children: [{ text: 'Kept' }] }]);
		await expect.element(page.getByText('Kept')).toBeInTheDocument();
		expect(editor.getSnapshot()).toEqual(exported);
		await unmount(second);
		target.remove();
	});

	it('disposes the Lexical editor when its content cannot be loaded', () => {
		const target = document.body.appendChild(document.createElement('div'));
		const signals: AbortSignal[] = [];
		const probe = defineExtension({
			name: 'test/probe',
			register: (_editor, _config, state) => {
				signals.push(state.getSignal());
				return () => {};
			}
		});
		const content = parseSnapshot({
			schema: { core: 1 },
			root: { ...paragraphs.root, children: [{ type: 'acme/unknown', version: 1 }] }
		});
		const editor = createEditor({ content, extensions: [probe] });

		expect(() => {
			mount(EditorContent, { target, props: { editor } });
			flushSync();
		}).toThrow('Lexical could not parse the Snapshot.');
		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(true);
		expect(() => editor.lexical).toThrow('The Editor is not mounted.');
		target.remove();
	});
});
