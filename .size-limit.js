import sveltePlugin from 'esbuild-svelte';

// size-limit leaves peer dependencies out of each bundle, so a budget covers blokki's own code.
const compileSvelte = (config) => ({
	...config,
	plugins: [...(config.plugins ?? []), sveltePlugin()]
});

export default [
	{
		name: 'blokki',
		path: 'dist/index.js',
		import: '*',
		limit: '3 kB',
		modifyEsbuildConfig: compileSvelte
	},
	{
		name: 'blokki/core',
		path: 'dist/core/index.js',
		import: '*',
		limit: '2 kB'
	}
];
