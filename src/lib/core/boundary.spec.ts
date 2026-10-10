import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const oxlint = join(root, 'node_modules/.bin/oxlint');

// The override in the lint config matches paths relative to the config file, so each fixture
// sits under src/lib/core in a scratch copy of the repository layout.
const scratch = mkdtempSync(join(tmpdir(), 'blokki-boundary-'));
copyFileSync(join(root, '.oxlintrc.json'), join(scratch, '.oxlintrc.json'));
mkdirSync(join(scratch, 'src/lib/core'), { recursive: true });

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function lintCoreModule(source: string): { exitCode: number; output: string } {
	const file = join(scratch, 'src/lib/core/fixture.ts');
	writeFileSync(file, source);
	try {
		const output = execFileSync(oxlint, [file], { cwd: scratch, encoding: 'utf8' });
		return { exitCode: 0, output };
	} catch (error) {
		const { status, stdout } = error as { status: number; stdout: string };
		return { exitCode: status, output: stdout };
	}
}

describe('headless core boundary', () => {
	it.each([
		["import { mount } from 'svelte';"],
		["import { fade } from 'svelte/transition';"],
		["import EditorContent from '../components/EditorContent.svelte';"],
		["import { state } from './state.svelte.js';"],
		["import * as root from '../index.js';"]
	])('rejects %s', (statement) => {
		const { exitCode, output } = lintCoreModule(`${statement}\n`);
		expect(exitCode).toBe(1);
		expect(output).toContain('no-restricted-imports');
	});

	it('allows Lexical and other core modules', () => {
		const { exitCode } = lintCoreModule(
			"import { $getRoot } from 'lexical';\nimport { snapshot } from './snapshot.js';\nexport { $getRoot, snapshot };\n"
		);
		expect(exitCode).toBe(0);
	});
});
