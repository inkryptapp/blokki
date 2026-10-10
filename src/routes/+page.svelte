<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>blokki</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-12">
	<h1 class="mb-4 text-3xl font-semibold">blokki</h1>
	<p class="mb-4">A Svelte 5 library for block-based rich-text editing, built on Lexical.</p>
	<a class="underline" href={resolve('/playground')}>Open the playground</a>
</main>
