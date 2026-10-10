<script lang="ts">
	import { createEditor, EditorContent } from '#lib';

	const editor = createEditor();
</script>

<svelte:head>
	<title>Playground · blokki</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-12">
	<h1 class="mb-6 text-2xl font-semibold">Playground</h1>
	<EditorContent
		{editor}
		aria-label="Document"
		class="min-h-64 rounded-md border border-neutral-300 p-4 leading-7 outline-none focus:border-neutral-500"
	>
		{#snippet skeleton()}
			<div
				data-testid="editor-skeleton"
				class="min-h-64 rounded-md border border-neutral-300 p-4"
				aria-hidden="true"
			>
				<div class="h-7 w-2/3 animate-pulse rounded bg-neutral-100"></div>
			</div>
		{/snippet}
	</EditorContent>
</main>
