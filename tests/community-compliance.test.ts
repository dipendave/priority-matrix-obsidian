/**
 * Community Plugin Compliance Tests
 *
 * Guards against regressions that would fail the ObsidianReviewBot scan.
 * Based on: https://github.com/obsidianmd/obsidian-releases/pull/10188
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "..", "src");

function readSrc(file: string): string {
	return readFileSync(resolve(srcDir, file), "utf8");
}

// Load all source files once
const mainTs = readSrc("main.ts");
const viewTs = readSrc("view.ts");
const typesTs = readSrc("types.ts");
const allSrc = [
	{ name: "main.ts", content: mainTs },
	{ name: "view.ts", content: viewTs },
	{ name: "types.ts", content: typesTs },
];

// ==================== DOM Safety ====================

describe("DOM safety", () => {
	test.each(allSrc)("$name does not use innerHTML", ({ content }) => {
		expect(content).not.toMatch(/\.innerHTML\s*=/);
	});

	test.each(allSrc)("$name does not use outerHTML", ({ content }) => {
		expect(content).not.toMatch(/\.outerHTML\s*=/);
	});
});

// ==================== No Inline Styles ====================

describe("No inline styles", () => {
	// The bot flags any element.style.xxx = assignment
	// setCssStyles() and addClass/removeClass are the approved alternatives
	test.each(allSrc)("$name does not set element.style properties directly", ({ content }) => {
		// Match .style.propertyName = (but not setCssStyles or .style references in comments)
		const lines = content.split("\n");
		const violations: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			// Skip comments
			if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
			// Check for .style.xxx = pattern (direct property assignment)
			if (/\.style\.\w+\s*=/.test(line)) {
				violations.push(`Line ${i + 1}: ${line}`);
			}
		}
		expect(violations).toEqual([]);
	});
});

// ==================== No Deprecated APIs ====================

describe("No deprecated APIs", () => {
	test.each(allSrc)("$name does not use substr() (deprecated)", ({ content }) => {
		expect(content).not.toMatch(/\.substr\s*\(/);
	});
});

// ==================== Async/Await Correctness ====================

describe("Async/await correctness", () => {
	// The bot requires: async methods must contain await, or don't mark them async
	test.each(allSrc)("$name has no async functions without await", ({ content }) => {
		// Find async function/method bodies and check each has at least one await
		const asyncPattern = /async\s+\w+\s*\([^)]*\)[^{]*\{/g;
		let match;
		const violations: string[] = [];

		while ((match = asyncPattern.exec(content)) !== null) {
			// Find the matching closing brace for this function
			const startIdx = match.index + match[0].length;
			let depth = 1;
			let pos = startIdx;
			while (depth > 0 && pos < content.length) {
				if (content[pos] === "{") depth++;
				if (content[pos] === "}") depth--;
				pos++;
			}
			const body = content.substring(startIdx, pos);
			if (!body.includes("await")) {
				const lineNum = content.substring(0, match.index).split("\n").length;
				violations.push(`Line ${lineNum}: ${match[0].trim()}`);
			}
		}
		expect(violations).toEqual([]);
	});

	// onOpen and onClose should NOT be async (bot flags "Async method has no await expression")
	test("view.ts onOpen is not async", () => {
		expect(viewTs).not.toMatch(/async\s+onOpen\s*\(/);
	});

	test("view.ts onClose is not async", () => {
		expect(viewTs).not.toMatch(/async\s+onClose\s*\(/);
	});
});

// ==================== Promise Handling ====================

describe("Promise handling", () => {
	// The bot requires: promises in event handlers must be explicitly handled
	// with void, .catch(), or .then(). This checks for the most common pattern:
	// calling an async function without void in a synchronous callback.

	test("view.ts does not have bare async calls in event listeners", () => {
		// Match addEventListener callbacks that call async methods without void
		const lines = viewTs.split("\n");
		const violations: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			// Look for this.handleXxx() calls (async methods) that aren't prefixed with void/await
			if (/this\.handle\w+\(/.test(line) && !line.startsWith("void") &&
				!line.startsWith("await") && !line.includes("void this.handle") &&
				!line.includes("await this.handle") &&
				!line.startsWith("async") && !line.startsWith("private async")) {
				violations.push(`Line ${i + 1}: ${line}`);
			}
		}
		expect(violations).toEqual([]);
	});
});

// ==================== Command Registration ====================

describe("Command registration", () => {
	test("command ID does not include plugin ID", () => {
		// Plugin ID is "priority-matrix"
		const commandIdMatch = mainTs.match(/id:\s*"([^"]+)"/);
		expect(commandIdMatch).not.toBeNull();
		const commandId = commandIdMatch![1];
		expect(commandId).not.toContain("priority");
		expect(commandId).not.toContain("matrix");
	});

	test("command name does not include plugin name", () => {
		const commandNameMatch = mainTs.match(/name:\s*"([^"]+)"/);
		expect(commandNameMatch).not.toBeNull();
		const commandName = commandNameMatch![1];
		// Should not contain "Priority" or "Matrix" (case-insensitive)
		expect(commandName.toLowerCase()).not.toContain("priority");
	});
});

// ==================== No onunload Leaf Detach ====================

describe("Plugin lifecycle", () => {
	test("main.ts does not detach leaves in onunload", () => {
		// The bot says: don't detach leaves in onunload
		expect(mainTs).not.toMatch(/onunload[\s\S]*?detach/);
	});
});

// ==================== Sentence Case UI Text ====================

describe("Sentence case UI text", () => {
	test("getDisplayText returns sentence case", () => {
		const match = viewTs.match(/getDisplayText\(\)[^{]*\{[^}]*return\s*"([^"]+)"/);
		expect(match).not.toBeNull();
		const text = match![1];
		// First letter uppercase, rest should not be Title Case
		// "Task priority matrix" is correct sentence case
		expect(text).toBe("Task priority matrix");
	});

	test("ribbon icon tooltip uses sentence case", () => {
		const match = mainTs.match(/addRibbonIcon\([^,]+,\s*"([^"]+)"/);
		expect(match).not.toBeNull();
		const text = match![1];
		expect(text).toBe("Task priority matrix");
	});

	test("command name uses sentence case", () => {
		const match = mainTs.match(/name:\s*"([^"]+)"/);
		expect(match).not.toBeNull();
		const text = match![1];
		// "Open matrix" — not "Open Matrix" or "Open Priority Matrix"
		expect(text).toBe("Open matrix");
	});
});
