import { defineConfig, devices } from '@playwright/test';

// The tests run against the same base path that GitHub Pages serves the site under.
const basePath = '/blokki';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		url: `http://localhost:4173${basePath}/`,
		env: { BASE_PATH: basePath }
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: { baseURL: `http://localhost:4173${basePath}/` },
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
