<script lang="ts">
	import './layout.css';
	import DemoLinks from './demo/DemoLinks.svelte';

	let { children } = $props();
</script>

{@render children()}<DemoLinks />
