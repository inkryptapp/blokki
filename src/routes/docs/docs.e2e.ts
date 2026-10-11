import { expect, test } from '@playwright/test';

const pages = [
	{ title: 'Getting started', path: 'docs/getting-started' },
	{ title: 'Snapshots', path: 'docs/snapshots' },
	{ title: 'Block IDs', path: 'docs/block-ids' },
	{ title: 'Collaboration', path: 'docs/collaboration' },
	{ title: 'Writing Extensions', path: 'docs/extensions' }
];

test('the landing page links to every docs page', async ({ page }) => {
	for (const { title, path } of pages) {
		await page.goto('');

		await page.getByRole('main').getByRole('link', { name: title, exact: true }).click();

		await expect(page).toHaveURL(new RegExp(`/blokki/${path}$`));
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	}
});

test('the docs navigation reaches every docs page and marks the current one', async ({ page }) => {
	const response = await page.goto('docs/getting-started');
	expect(response?.status()).toBe(200);
	const navigation = page.getByRole('navigation', { name: 'Docs' });

	for (const { title, path } of pages) {
		const link = navigation.getByRole('link', { name: title, exact: true });

		await link.click();

		await expect(page).toHaveURL(new RegExp(`/blokki/${path}$`));
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await expect(link).toHaveAttribute('aria-current', 'page');
	}
});
