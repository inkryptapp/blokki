import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { createEditor, EditorContent } from '../index.js';

describe('EditorContent during SSR', () => {
	it('renders the skeleton snippet in place of the editable root', () => {
		const skeleton = createRawSnippet(() => ({
			render: () => '<p class="skeleton">Loading the document</p>'
		}));

		const { body } = render(EditorContent, { props: { editor: createEditor(), skeleton } });

		expect(body).toContain('<p class="skeleton">Loading the document</p>');
		expect(body).not.toContain('role="textbox"');
	});

	it('renders an empty, non-editable shell without a skeleton', () => {
		const { body } = render(EditorContent, { props: { editor: createEditor() } });

		// Svelte adds hydration markers and whitespace around the root element.
		expect(body).toMatch(
			/^(\s|<!--[^>]*-->)*<div[^>]*role="textbox"[^>]*><\/div>(\s|<!--[^>]*-->)*$/
		);
		expect(body).not.toContain('contenteditable');
	});
});
