import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

type ExportTarget = string | { [condition: string]: ExportTarget };

const root = new URL('../../', import.meta.url);

/** Lists each subpath export with the source module that svelte-package builds it from. */
function subpathSources(): [subpath: string, source: string][] {
	const { exports } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
		exports: Record<string, ExportTarget>;
	};
	return Object.entries(exports).map(([subpath, target]) => [subpath, sourceOf(target)]);
}

function sourceOf(target: ExportTarget): string {
	const built = typeof target === 'string' ? target : (target.svelte ?? target.default);
	if (typeof built !== 'string' || !built.startsWith('./dist/')) {
		throw new Error(`Cannot map export target ${JSON.stringify(target)} to a source module.`);
	}
	const js = fileURLToPath(new URL(built.replace('./dist/', 'src/lib/'), root));
	const ts = js.replace(/\.js$/, '.ts');
	return existsSync(ts) ? ts : js;
}

/**
 * Imports a module in Node with `navigator` hidden as well. Node lacks the other browser globals,
 * so a module that reads any of them at import time throws.
 */
async function importWithoutBrowserGlobals(path: string): Promise<unknown> {
	vi.stubGlobal('navigator', undefined);
	try {
		return await import(/* @vite-ignore */ path);
	} finally {
		vi.unstubAllGlobals();
	}
}

describe('subpath exports', () => {
	it.each(subpathSources())('%s imports without touching a browser global', async (_, source) => {
		await expect(importWithoutBrowserGlobals(source)).resolves.toBeDefined();
	});

	it('rejects a module that touches a browser global at import time', async () => {
		const fixture = fileURLToPath(new URL('src/test-fixtures/touches-browser-global.ts', root));
		await expect(importWithoutBrowserGlobals(fixture)).rejects.toThrow(ReferenceError);
	});
});

describe('the Svelte entry', () => {
	it('bundles no collaboration code', async () => {
		const { metafile } = await build({
			entryPoints: [fileURLToPath(new URL('src/lib/index.ts', root))],
			bundle: true,
			write: false,
			metafile: true,
			format: 'esm',
			packages: 'external',
			plugins: [sveltePlugin()],
			logLevel: 'silent'
		});
		const inputs = Object.keys(metafile.inputs);
		const packages = Object.values(metafile.outputs).flatMap(({ imports }) =>
			imports.map(({ path }) => path)
		);

		expect(inputs).toContainEqual(expect.stringMatching(/src\/lib\/editor\/editor\.ts$/));
		expect(inputs.filter((input) => input.includes('src/lib/collab/'))).toEqual([]);
		expect(packages.filter((path) => /^(yjs|@lexical\/yjs)(\/|$)/.test(path))).toEqual([]);
	});
});
