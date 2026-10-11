<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { docsPages } from './pages.js';

	let { children } = $props();
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12 md:flex-row">
	<nav aria-label="Docs" class="md:w-48 md:shrink-0">
		<a class="mb-4 block text-lg font-semibold" href={resolve('/')}>blokki</a>
		<ul class="flex flex-wrap gap-x-4 gap-y-2 md:flex-col">
			{#each docsPages as { route, title } (route)}
				<li>
					<a
						class="text-neutral-600 hover:text-neutral-950 aria-[current=page]:font-medium aria-[current=page]:text-neutral-950"
						href={resolve(route)}
						aria-current={page.route.id === route ? 'page' : undefined}>{title}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
	<main class="docs min-w-0 flex-1">
		{@render children()}
	</main>
</div>

<style>
	.docs {
		line-height: 1.7;
	}

	.docs :global(h1) {
		margin-bottom: 1.5rem;
		font-size: 1.875rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.docs :global(h2) {
		margin-top: 2.5rem;
		margin-bottom: 1rem;
		font-size: 1.375rem;
		font-weight: 600;
	}

	.docs :global(p),
	.docs :global(ul),
	.docs :global(ol),
	.docs :global(pre),
	.docs :global(table),
	.docs :global(aside) {
		margin-bottom: 1rem;
	}

	.docs :global(ul) {
		padding-left: 1.5rem;
		list-style: disc;
	}

	.docs :global(ol) {
		padding-left: 1.5rem;
		list-style: decimal;
	}

	.docs :global(li) {
		margin-bottom: 0.25rem;
	}

	.docs :global(a) {
		text-decoration: underline;
	}

	.docs :global(code) {
		font-size: 0.875em;
	}

	.docs :global(:not(pre) > code) {
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		background: #f5f5f5;
	}

	.docs :global(pre) {
		overflow-x: auto;
		padding: 1rem;
		border-radius: 0.375rem;
		background: #f5f5f5;
		line-height: 1.5;
		tab-size: 2;
	}

	.docs :global(th),
	.docs :global(td) {
		padding: 0.375rem 0.75rem 0.375rem 0;
		border-bottom: 1px solid #e5e5e5;
		text-align: left;
		vertical-align: top;
	}

	.docs :global(aside) {
		padding: 0.75rem 1rem;
		border-left: 3px solid #a3a3a3;
		background: #fafafa;
	}
</style>
