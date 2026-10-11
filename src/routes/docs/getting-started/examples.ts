export const install = `pnpm add blokki lexical @lexical/extension @lexical/rich-text`;

export const basic = `<script lang="ts">
	import { createEditor, EditorContent } from 'blokki';

	const editor = createEditor();
</script>

<EditorContent {editor} aria-label="Document" class="editor" />`;

export const skeleton = `<EditorContent {editor} aria-label="Document" class="editor">
	{#snippet skeleton()}
		<div class="editor" aria-hidden="true">
			<div class="skeleton-line"></div>
		</div>
	{/snippet}
</EditorContent>`;

export const lexical = `import { $getRoot } from 'lexical';

const text = editor.lexical.read(() => $getRoot().getTextContent());`;
