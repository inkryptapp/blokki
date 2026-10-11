import { defineExtension } from 'lexical';
import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import formattedText from '../../test-fixtures/snapshots/formatted-text.json';
import headingsAndQuote from '../../test-fixtures/snapshots/headings-and-quote.json';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import { noteExtension } from '../../test-utils/note.js';
import {
	NewerSchemaVersionError,
	parseSnapshot,
	type UpgradeRequiredError
} from '../core/index.js';
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
			// A node without a type is malformed JSON that no Extension can read.
			root: { ...paragraphs.root, children: [{ version: 1 }] }
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

	it('runs pending Migrations when it mounts', async () => {
		const content = parseSnapshot({
			schema: { 'acme/note': 1, core: 1 },
			root: {
				...paragraphs.root,
				children: [{ ...paragraphs.root.children[0], type: 'acme-note', color: 'yellow' }]
			}
		});
		const editor = createEditor({ content, extensions: [noteExtension(3)] });

		await render(EditorContent, { editor, 'aria-label': 'Document' });

		await expect
			.element(page.getByRole('textbox', { name: 'Document' }))
			.toHaveTextContent('The first paragraph.');
		const snapshot = editor.getSnapshot();
		expect(snapshot.schema).toEqual({ 'acme/note': 3, core: 1 });
		expect(snapshot.root.children[0]).toMatchObject({ tone: 'warning', icon: '⚠️' });
	});

	it('opens a document with a newer Schema Version read-only and reports it', async () => {
		const content = parseSnapshot({ ...paragraphs, schema: { core: 2 } });
		const reports: UpgradeRequiredError[] = [];
		const editor = createEditor({
			content,
			onUpgradeRequired: (error) => reports.push(error)
		});

		const view = await render(EditorContent, { editor, 'aria-label': 'Document' });
		const textbox = page.getByRole('textbox', { name: 'Document' });

		await expect.element(textbox).toHaveTextContent('The first paragraph.');
		await expect.element(textbox).toHaveAttribute('contenteditable', 'false');
		expect(reports).toHaveLength(1);
		expect(reports[0]).toBeInstanceOf(NewerSchemaVersionError);
		expect(reports[0]).toMatchObject({ schema: 'core', documentVersion: 2, supportedVersion: 1 });
		expect(editor.upgradeRequired).toBe(reports[0]);

		await textbox.click();
		await userEvent.keyboard('typed');
		await expect.element(textbox).not.toHaveTextContent('typed');
		expect(editor.getSnapshot()).toBe(content);

		await view.unmount();
		expect(editor.getSnapshot()).toBe(content);
		await render(EditorContent, { editor, 'aria-label': 'Again' });
		expect(reports).toHaveLength(1);
		expect(editor.getSnapshot()).toBe(content);
	});

	it('reports a newer document even when it has node types this code cannot read', async () => {
		const content = parseSnapshot({
			schema: { 'acme/future': 1, core: 2 },
			root: { ...paragraphs.root, children: [{ type: 'acme-future', version: 1 }] }
		});
		const reports: UpgradeRequiredError[] = [];
		const editor = createEditor({ content, onUpgradeRequired: (error) => reports.push(error) });

		await render(EditorContent, { editor, 'aria-label': 'Document' });

		await expect
			.element(page.getByRole('textbox', { name: 'Document' }))
			.toHaveAttribute('contenteditable', 'false');
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({ schema: 'core', documentVersion: 2 });
		expect(editor.getSnapshot()).toBe(content);
	});
});
