<script lang="ts">
	import { resolve } from '$app/paths';
	import { docsPages } from './docs/pages.js';
</script>

<svelte:head>
	<title>blokki</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-12">
	<h1 class="mb-4 text-3xl font-semibold">blokki</h1>
	<p class="mb-4">A Svelte 5 library for block-based rich-text editing, built on Lexical.</p>
	<a class="underline" href={resolve('/playground')}>Open the playground</a>
	<h2 class="mt-8 mb-2 text-xl font-semibold">Docs</h2>
	<ul class="list-disc pl-6">
		{#each docsPages as { route, title } (route)}
			<li><a class="underline" href={resolve(route)}>{title}</a></li>
		{/each}
	</ul>
</main>
