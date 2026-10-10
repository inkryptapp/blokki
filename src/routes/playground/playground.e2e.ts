import { expect, test } from '@playwright/test';

test('the playground Editor renders on the server, hydrates, and accepts typing', async ({
	page
}) => {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			problems.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
	// Tags the heading that the HTML parser creates. If hydration fails, Svelte replaces the
	// server-rendered DOM, and the heading found after hydration no longer carries the tag.
	await page.addInitScript(() => {
		const observer = new MutationObserver(() => {
			const heading = document.querySelector('h1');
			if (heading !== null) {
				Reflect.set(heading, 'serverRendered', true);
				observer.disconnect();
			}
		});
		observer.observe(document, { childList: true, subtree: true });
	});

	const response = await page.goto('/playground');

	expect(response?.status()).toBe(200);
	expect(await response?.text()).toContain('data-testid="editor-skeleton"');
	const editor = page.getByRole('textbox', { name: 'Document' });
	await expect(editor).toHaveAttribute('contenteditable', 'true');
	await expect(page.getByTestId('editor-skeleton')).toHaveCount(0);
	const heading = page.getByRole('heading', { name: 'Playground' });
	expect(await heading.evaluate((element) => Reflect.get(element, 'serverRendered'))).toBe(true);

	await editor.click();
	await page.keyboard.type('Hello, blokki');

	await expect(editor).toHaveText('Hello, blokki');
	expect(problems).toEqual([]);
});
