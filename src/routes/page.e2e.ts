import { expect, test } from '@playwright/test';

test('the landing page links to the playground', async ({ page }) => {
	const response = await page.goto('');

	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'blokki' })).toBeVisible();

	await page.getByRole('link', { name: 'Open the playground' }).click();

	await expect(page).toHaveURL(/\/blokki\/playground$/);
	await expect(page.getByRole('textbox', { name: 'Document' })).toHaveAttribute(
		'contenteditable',
		'true'
	);
});
