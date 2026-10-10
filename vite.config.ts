import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

const isBasePath = (value: string): value is `/${string}` => value.startsWith('/');

/**
 * Reads the site's base path from `BASE_PATH`. GitHub Pages serves the site under the
 * repository name, so the deploy workflow sets it to `/blokki`.
 */
function basePath(value: string | undefined): '' | `/${string}` {
	if (value === undefined || value === '') {
		return '';
	}
	if (!isBasePath(value)) {
		throw new Error(`BASE_PATH must start with "/", got "${value}".`);
	}
	return value;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Every route is prerendered. adapter-static fails the build if one is not.
			adapter: adapter(),
			paths: { base: basePath(process.env.BASE_PATH) }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
