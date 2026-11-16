import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.spec.ts",
	// Bundles the real view code for tests/harness/index.html
	globalSetup: "./tests/harness/global-setup.ts",
	projects: [
		{
			name: "iphone-16-pro",
			use: {
				browserName: "chromium",
				viewport: { width: 393, height: 852 },
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: "iphone-se",
			use: {
				browserName: "chromium",
				viewport: { width: 375, height: 667 },
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: "desktop",
			use: {
				browserName: "chromium",
				viewport: { width: 1280, height: 720 },
			},
		},
	],
});
