import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import paragraphs from '../../test-fixtures/snapshots/paragraphs.json';
import { placeCaretAtEnd } from '../../test-utils/editor.js';
import { parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent } from '../index.js';

const BLOCK_ID = /^[A-Za-z0-9_-]{10}$/;
const ids = paragraphs.root.children.map((node) => node.$.blockId);

describe('Block IDs in a mounted Editor', () => {
	it('render as data-block-id attributes, never as DOM ids', async () => {
		const editor = createEditor({ content: parseSnapshot(paragraphs) });
		await render(EditorContent, { editor, 'aria-label': 'Document' });
		const root = page.getByRole('textbox', { name: 'Document' }).element();
		await expect.element(page.getByText('The first paragraph.')).toBeInTheDocument();

		await page.getByRole('textbox', { name: 'Document' }).click();
		placeCaretAtEnd(editor, 3);
		await userEvent.keyboard('{Enter}New paragraph');
		await expect.element(page.getByText('New paragraph')).toBeInTheDocument();

		const blocks = [...root.children];
		expect(blocks).toHaveLength(5);
		expect(blocks.slice(0, 4).map((block) => block.getAttribute('data-block-id'))).toEqual(ids);
		expect(blocks[4]?.getAttribute('data-block-id')).toMatch(BLOCK_ID);
		expect(root.querySelectorAll('[id]')).toHaveLength(0);
	});

	it('scrolls a Block into view', async () => {
		const many = parseSnapshot({
			...paragraphs,
			root: {
				...paragraphs.root,
				children: Array.from({ length: 40 }, (_, index) => ({
					...paragraphs.root.children[0],
					$: { blockId: `block${String(index).padStart(5, '0')}` }
				}))
			}
		});
		const editor = createEditor({ content: many });
		await render(EditorContent, {
			editor,
			'aria-label': 'Document',
			style: 'height: 120px; overflow: auto'
		});
		const root = page.getByRole('textbox', { name: 'Document' }).element();
		await expect.element(page.getByRole('textbox', { name: 'Document' })).toBeInTheDocument();

		expect(editor.scrollToBlock('block00039')).toBe(true);

		await expect.poll(() => root.scrollTop).toBeGreaterThan(0);
		const target = root.querySelector('[data-block-id="block00039"]');
		const bounds = root.getBoundingClientRect();
		const block = target?.getBoundingClientRect();
		expect(block?.top).toBeGreaterThanOrEqual(bounds.top - 1);
		expect(block?.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
		expect(editor.scrollToBlock('missing000')).toBe(false);
	});
});

describe('Anchor Links', () => {
	it('default to a fragment with the Block ID', () => {
		expect(createEditor().getAnchorLink('abcdefghij')).toBe('#abcdefghij');
	});

	it('use the function that the app configures', () => {
		const editor = createEditor({
			anchorLink: (blockId) => `https://notes.example/doc/42#block-${blockId}`
		});

		expect(editor.getAnchorLink('abcdefghij')).toBe(
			'https://notes.example/doc/42#block-abcdefghij'
		);
	});
});
