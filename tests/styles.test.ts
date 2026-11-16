/**
 * Guards for CSS that real-browser tests cannot verify.
 *
 * The Playwright suite runs Chromium, which already disables text selection
 * on draggable elements and has no -webkit-touch-callout at all. The rules
 * below exist for iOS, where a long-press otherwise selects text or opens the
 * callout menu instead of starting a drag, so they are checked at the source.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve(__dirname, "..", "styles.css"), "utf8");

/** Declarations of the first top-level rule with exactly this selector */
function declarationsOf(selector: string): Record<string, string> {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
	if (!match) throw new Error(`No rule found for "${selector}"`);
	const body = match[1].replace(/\/\*[\s\S]*?\*\//g, "");
	const declarations: Record<string, string> = {};
	for (const line of body.split(";")) {
		const [property, ...value] = line.split(":");
		if (value.length > 0) declarations[property.trim()] = value.join(":").trim();
	}
	return declarations;
}

describe("touch-drag CSS", () => {
	it("stops a long-press from selecting task text", () => {
		const task = declarationsOf(".pm-task");
		expect(task["user-select"]).toBe("none");
		expect(task["-webkit-user-select"]).toBe("none");
	});

	it("stops a long-press from opening the iOS callout menu", () => {
		expect(declarationsOf(".pm-task")["-webkit-touch-callout"]).toBe("none");
	});

	it("keeps text in the inline edit field selectable", () => {
		const input = declarationsOf(".pm-task input");
		expect(input["user-select"]).toBe("text");
		expect(input["-webkit-user-select"]).toBe("text");
	});
});

describe("drop indicator CSS", () => {
	it("takes up no space, so showing it cannot shift tasks", () => {
		expect(declarationsOf(".pm-drop-indicator")["height"]).toBe("0");
	});

	it("never intercepts the pointer", () => {
		expect(declarationsOf(".pm-drop-indicator")["pointer-events"]).toBe("none");
	});

	it("draws its line in the theme's accent colour", () => {
		expect(declarationsOf(".pm-drop-indicator::before")["background"]).toBe("var(--interactive-accent)");
	});
});

describe("Obsidian directory CSS rules", () => {
	it("does not use !important", () => {
		const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
		expect(withoutComments).not.toMatch(/!important/);
	});
});
