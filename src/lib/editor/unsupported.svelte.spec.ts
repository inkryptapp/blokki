import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import fixture from '../../test-fixtures/snapshots/unsupported-nodes.json';
import { parseSnapshot } from '../core/index.js';
import { createEditor, EditorContent } from '../index.js';

const BLOCK_MESSAGE = 'This content needs a feature that is turned off.';

describe('Unsupported Blocks in an Editor', () => {
	it('show a placeholder and keep their content unchanged', async () => {
		const content = parseSnapshot(fixture);
		const editor = createEditor({ content });
		await render(EditorContent, { editor, 'aria-label': 'Document' });
		const block = page.getByText(BLOCK_MESSAGE);
		const inline = page.getByText('Unsupported content');

		await expect.element(block).toBeVisible();
		await expect.element(inline).toBeVisible();
		expect(block.element().closest('[contenteditable="false"]')).not.toBeNull();

		await block.click();
		await userEvent.keyboard('typed');
		await inline.click();
		await userEvent.keyboard('typed');

		await expect.element(block).toHaveTextContent(BLOCK_MESSAGE);
		await expect.element(inline).toHaveTextContent('Unsupported content');
		const exported = editor.getSnapshot();
		expect(exported.schema).toEqual(content.schema);
		expect(exported.root.children).toContainEqual(content.root.children[1]);
		expect(JSON.stringify(exported)).toContain(
			JSON.stringify(fixture.root.children[2]?.children[1])
		);
	});
});
