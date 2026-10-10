<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Editor } from '../editor/editor.js';

	/** Props of {@link EditorContent}. */
	export interface EditorContentProps extends Omit<
		HTMLAttributes<HTMLDivElement>,
		'children' | 'contenteditable' | 'role'
	> {
		/** The Editor to show. One `EditorContent` at a time can show an Editor. */
		editor: Editor;
		/**
		 * Content to render in place of the editable root during SSR and until the component
		 * mounts in the browser. A skeleton that matches the document's layout keeps the page
		 * from jumping.
		 */
		skeleton?: Snippet;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { mountEditor } from '../editor/editor.js';

	let { editor, skeleton, ...attributes }: EditorContentProps = $props();
	let browser = $state(false);

	onMount(() => {
		browser = true;
	});
</script>

{#if skeleton && !browser}
	{@render skeleton()}
{:else}
	<div
		{...attributes}
		role="textbox"
		aria-multiline="true"
		{@attach (root) => mountEditor(editor, root)}
	></div>
{/if}

<!--
@component
Shows an Editor. During SSR it renders an empty, non-editable root, or the `skeleton` snippet in
its place. In the browser it builds the Lexical editor and attaches it to its root element. Unmounting it disposes
the Lexical editor, which runs every extension cleanup and removes the listeners and DOM it added.

Other attributes, such as `class` and `aria-label`, go on the editable root element.

```svelte
<EditorContent {editor} aria-label="Document">
	{#snippet skeleton()}
		<p class="skeleton-line"></p>
	{/snippet}
</EditorContent>
```
-->
