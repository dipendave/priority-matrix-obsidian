import { buildSync } from "esbuild";
import path from "path";

/**
 * Bundle the plugin's real source for the browser harness, with `obsidian`
 * resolved to the test mock. Runs once before the Playwright suite, so the
 * harness always reflects the current source.
 */
export default function globalSetup(): void {
	buildSync({
		entryPoints: [path.resolve(__dirname, "entry.ts")],
		bundle: true,
		format: "iife",
		target: "es2018",
		sourcemap: "inline",
		outfile: path.resolve(__dirname, "harness.bundle.js"),
		alias: {
			obsidian: path.resolve(__dirname, "../__mocks__/obsidian.ts"),
		},
		logLevel: "warning",
	});
}
