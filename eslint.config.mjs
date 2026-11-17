import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Mirrors the checks Obsidian's community directory runs on every release.
// Lint from the project root (`eslint .`): the recommended config also checks
// manifest.json, package.json and LICENSE, which `eslint src/` never visits.
export default defineConfig([
	// Build output, Node build scripts and test code are not plugin source.
	globalIgnores([
		"node_modules",
		"main.js",
		"esbuild.config.mjs",
		"jest.config.js",
		"playwright.config.ts",
		"scripts",
		"tests",
		"test-results",
	]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
	},
]);
