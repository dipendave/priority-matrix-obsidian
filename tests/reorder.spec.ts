/**
 * Real-browser tests for reordering tasks by drag and drop.
 *
 * These run the plugin's actual view code (see tests/harness) and drive it
 * with genuine input: trusted touch events on the phone viewports, real mouse
 * drags on desktop. Unlike the jsdom tests they exercise real layout, real
 * scrolling and the browser's own default touch behaviour.
 */
import { test, expect, Page, CDPSession } from "@playwright/test";
import path from "path";

const harnessUrl = "file://" + path.resolve(__dirname, "harness/index.html").replace(/\\/g, "/");

const LONG_PRESS_MS = 250;
/** Comfortably past the long-press delay */
const HOLD_MS = LONG_PRESS_MS + 150;

type Q = "q1" | "q2" | "q3" | "q4";
type Point = { x: number; y: number };

// ==================== Page helpers ====================

async function mount(page: Page, tasks: Partial<Record<Q, string[]>>): Promise<void> {
	await page.goto(harnessUrl);
	await page.evaluate((t) => window.mountMatrix(t as never), tasks);
}

/** Titles of the tasks as rendered in a quadrant, top to bottom */
function rendered(page: Page, q: Q): Promise<string[]> {
	return page.locator(`[data-quadrant="${q}"] .pm-task .pm-task-title`).allTextContents();
}

/** Titles of the tasks as stored by the plugin, in order */
function stored(page: Page, q: Q): Promise<string[]> {
	return page.evaluate((quadrant) => window.matrix.titles(quadrant as never), q);
}

function saveCount(page: Page): Promise<number> {
	return page.evaluate(() => window.matrix.saveCount());
}

function taskLocator(page: Page, title: string) {
	// Scoped to the view: the floating copy shown during a touch drag is also a .pm-task
	return page.locator("#leaf .pm-task").filter({ has: page.getByText(title, { exact: true }) });
}

async function boxOf(page: Page, title: string) {
	const box = await taskLocator(page, title).boundingBox();
	if (!box) throw new Error(`Task "${title}" has no bounding box`);
	return box;
}

/** Middle of a task */
async function centerOf(page: Page, title: string): Promise<Point> {
	const box = await boxOf(page, title);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A point in the upper quarter of a task: dropping here lands before it */
async function upperPartOf(page: Page, title: string): Promise<Point> {
	const box = await boxOf(page, title);
	return { x: box.x + box.width / 2, y: box.y + box.height * 0.25 };
}

/** A point in the lower quarter of a task: dropping here lands after it */
async function lowerPartOf(page: Page, title: string): Promise<Point> {
	const box = await boxOf(page, title);
	return { x: box.x + box.width / 2, y: box.y + box.height * 0.75 };
}

function scrollTopOf(page: Page, selector: string): Promise<number> {
	return page.locator(selector).first().evaluate((el) => el.scrollTop);
}

/** Wait until an element's scroll position has stopped changing, and return it */
async function waitForScrollToSettle(page: Page, selector: string): Promise<number> {
	let previous = -1;
	for (let i = 0; i < 100; i++) {
		const current = await scrollTopOf(page, selector);
		if (current === previous) return current;
		previous = current;
		await page.waitForTimeout(100);
	}
	throw new Error(`${selector} never stopped scrolling`);
}

// ==================== Touch driver ====================
// Chrome DevTools Protocol touch events are trusted input: the browser treats
// them like a real finger, including scrolling the page unless the page
// calls preventDefault().

class Finger {
	private at: Point = { x: 0, y: 0 };

	private constructor(private cdp: CDPSession, private page: Page) {}

	static async on(page: Page): Promise<Finger> {
		return new Finger(await page.context().newCDPSession(page), page);
	}

	async down(point: Point): Promise<void> {
		this.at = point;
		await this.cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: point.x, y: point.y }],
		});
	}

	/** Glide to a point in several small steps, like a real finger */
	async moveTo(point: Point, steps = 10): Promise<void> {
		const from = this.at;
		for (let i = 1; i <= steps; i++) {
			const x = from.x + ((point.x - from.x) * i) / steps;
			const y = from.y + ((point.y - from.y) * i) / steps;
			await this.cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x, y }],
			});
			await this.page.waitForTimeout(16);
		}
		this.at = point;
	}

	async up(): Promise<void> {
		await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	}

	async cancel(): Promise<void> {
		await this.cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
	}

	/** Press and hold on a task until the long-press drag begins */
	async longPress(point: Point): Promise<void> {
		await this.down(point);
		await this.page.waitForTimeout(HOLD_MS);
	}
}

// ==================== Phone: long-press reordering ====================

test.describe("Phone — reorder tasks by long-press drag", () => {
	test.beforeEach(({ isMobile }) => {
		test.skip(!isMobile, "Touch tests run on the phone viewports");
	});

	test("dragging the first task below the last moves it to the end", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up();

		expect(await rendered(page, "q1")).toEqual(["Bravo", "Charlie", "Alpha"]);
		expect(await stored(page, "q1")).toEqual(["Bravo", "Charlie", "Alpha"]);
	});

	test("dragging the last task above the first moves it to the top", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Charlie"));
		await finger.moveTo(await upperPartOf(page, "Alpha"));
		await finger.up();

		expect(await rendered(page, "q1")).toEqual(["Charlie", "Alpha", "Bravo"]);
	});

	test("dragging into the middle of a longer list", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Echo"));
		await finger.moveTo(await upperPartOf(page, "Bravo"));
		await finger.up();

		expect(await rendered(page, "q1")).toEqual(["Alpha", "Echo", "Bravo", "Charlie", "Delta"]);
	});

	test("a reorder saves exactly once", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up();

		expect(await saveCount(page)).toBe(1);
	});

	test("releasing a task where it started changes nothing and does not save", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Bravo"));
		await finger.moveTo(await lowerPartOf(page, "Alpha"));
		await finger.up();

		expect(await rendered(page, "q1")).toEqual(["Alpha", "Bravo", "Charlie"]);
		expect(await saveCount(page)).toBe(0);
	});

	test("two reorders in a row both take effect", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up(); // Bravo Charlie Alpha

		await finger.longPress(await centerOf(page, "Charlie"));
		await finger.moveTo(await upperPartOf(page, "Bravo"));
		await finger.up(); // Charlie Bravo Alpha

		expect(await rendered(page, "q1")).toEqual(["Charlie", "Bravo", "Alpha"]);
		expect(await saveCount(page)).toBe(2);
	});

	test("dragging into another quadrant inserts at the drop position", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"], q2: ["Xray", "Yankee", "Zulu"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await upperPartOf(page, "Yankee"));
		await finger.up();

		expect(await rendered(page, "q2")).toEqual(["Xray", "Alpha", "Yankee", "Zulu"]);
		expect(await rendered(page, "q1")).toEqual(["Bravo"]);
	});

	test("dragging onto an empty, collapsed quadrant moves the task there", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"] });
		const finger = await Finger.on(page);
		const q3Header = await page.locator('[data-quadrant="q3"] .pm-quadrant-header').boundingBox();

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo({ x: q3Header!.x + q3Header!.width / 2, y: q3Header!.y + q3Header!.height / 2 });
		await finger.up();

		expect(await rendered(page, "q3")).toEqual(["Alpha"]);
		expect(await rendered(page, "q1")).toEqual(["Bravo"]);
	});
});

// ==================== Phone: what the user sees while dragging ====================

test.describe("Phone — feedback while dragging", () => {
	test.beforeEach(({ isMobile }) => {
		test.skip(!isMobile, "Touch tests run on the phone viewports");
	});

	test("a floating copy of the task follows the finger", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		const clone = page.locator(".pm-touch-clone");
		await expect(clone).toBeVisible();
		const before = await clone.boundingBox();

		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		const after = await clone.boundingBox();
		await finger.up();

		expect(after!.y).toBeGreaterThan(before!.y + 30);
	});

	test("the drop indicator is a visible line between the right two tasks", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie", "Delta"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Bravo"));

		// The line itself is drawn by the indicator's ::before
		const line = await page.locator(".pm-drop-indicator").evaluate((el) => {
			const style = getComputedStyle(el, "::before");
			const host = el.getBoundingClientRect();
			return {
				color: style.backgroundColor,
				height: parseFloat(style.height),
				width: parseFloat(style.width),
				top: host.top + parseFloat(style.top),
			};
		});
		const bravo = await boxOf(page, "Bravo");
		const charlie = await boxOf(page, "Charlie");
		await finger.up();

		expect(line.color).toBe("rgb(124, 92, 191)"); // --interactive-accent in the harness
		expect(line.height).toBeGreaterThanOrEqual(2);
		expect(line.width).toBeGreaterThan(200);
		// Sits in the gap: at or below Bravo's bottom edge, and above Charlie's top edge
		expect(line.top).toBeGreaterThanOrEqual(bravo.y + bravo.height - 0.5);
		expect(line.top + line.height).toBeLessThanOrEqual(charlie.y + 0.5);
	});

	test("showing the indicator does not shift any task", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie", "Delta"] });
		const titles = ["Alpha", "Bravo", "Charlie", "Delta"];
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		const before = await Promise.all(titles.map((t) => boxOf(page, t)));

		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(1);
		const during = await Promise.all(titles.map((t) => boxOf(page, t)));
		await finger.up();

		expect(during).toEqual(before);
	});

	test("the indicator is hidden over the task's own position", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Bravo"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(1);

		await finger.moveTo(await centerOf(page, "Bravo"));
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(0);
		await finger.up();
	});

	test("only the quadrant under the finger is highlighted", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"], q2: ["Xray"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await centerOf(page, "Xray"));

		await expect(page.locator(".pm-drop-target")).toHaveCount(1);
		await expect(page.locator('[data-quadrant="q2"]')).toHaveClass(/pm-drop-target/);
		await finger.up();
	});

	test("nothing is left behind after the drop", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up();

		await expect(page.locator(".pm-touch-clone")).toHaveCount(0);
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(0);
		await expect(page.locator(".pm-drop-target")).toHaveCount(0);
		await expect(page.locator(".pm-dragging")).toHaveCount(0);
	});

	test("a cancelled touch leaves the order alone and cleans up", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.cancel();

		expect(await rendered(page, "q1")).toEqual(["Alpha", "Bravo", "Charlie"]);
		expect(await saveCount(page)).toBe(0);
		await expect(page.locator(".pm-touch-clone")).toHaveCount(0);
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(0);
	});
});

// ==================== Phone: drag vs. scroll vs. tap ====================

test.describe("Phone — dragging coexists with scrolling and tapping", () => {
	const LONG_LIST = {
		q1: ["Mover", "One-2", "One-3"],
		q2: ["Two-1", "Two-2", "Two-3", "Two-4"],
		q3: ["Three-1", "Three-2", "Three-3", "Three-4"],
		q4: ["Four-1", "Four-2", "Four-3", "Four-4", "Four-5", "Four-6", "Four-7", "Last"],
	};

	test.beforeEach(({ isMobile }) => {
		test.skip(!isMobile, "Touch tests run on the phone viewports");
	});

	test("the view is taller than the screen in this scenario", async ({ page }) => {
		await mount(page, LONG_LIST);
		const overflow = await page.locator(".pm-container").evaluate((el) => el.scrollHeight - el.clientHeight);
		expect(overflow).toBeGreaterThan(200);
	});

	test("a quick swipe scrolls the view and does not start a drag", async ({ page }) => {
		await mount(page, LONG_LIST);
		const finger = await Finger.on(page);
		const start = await centerOf(page, "Two-2");

		await finger.down(start);
		await finger.moveTo({ x: start.x, y: start.y - 200 }, 12);
		await finger.up();

		expect(await waitForScrollToSettle(page, ".pm-container")).toBeGreaterThan(50);
		await expect(page.locator(".pm-touch-clone")).toHaveCount(0);
		expect(await stored(page, "q2")).toEqual(LONG_LIST.q2);
		expect(await saveCount(page)).toBe(0);
	});

	test("the view does not scroll while a task is being dragged", async ({ page }) => {
		await mount(page, LONG_LIST);
		const finger = await Finger.on(page);
		const start = await centerOf(page, "Two-3");

		await finger.longPress(start);
		// Same gesture that scrolls when it is a swipe, but kept away from the edges
		await finger.moveTo({ x: start.x, y: start.y - 120 }, 12);
		await page.waitForTimeout(200);

		expect(await scrollTopOf(page, ".pm-container")).toBe(0);
		await finger.up();
	});

	test("holding a dragged task near the bottom edge scrolls down to reach off-screen tasks", async ({ page }) => {
		await mount(page, LONG_LIST);
		const finger = await Finger.on(page);
		const leaf = (await page.locator("#leaf").boundingBox())!;
		expect((await boxOf(page, "Last")).y, "Last task starts off-screen").toBeGreaterThan(leaf.y + leaf.height);

		const start = await centerOf(page, "Mover");
		await finger.longPress(start);
		await finger.moveTo({ x: start.x, y: leaf.y + leaf.height - 15 });
		const scrolled = await waitForScrollToSettle(page, ".pm-container");
		expect(scrolled).toBeGreaterThan(200);

		await finger.moveTo(await lowerPartOf(page, "Last"));
		await finger.up();

		expect(await stored(page, "q4")).toEqual([...LONG_LIST.q4, "Mover"]);
		expect(await stored(page, "q1")).toEqual(["One-2", "One-3"]);
	});

	test("holding a dragged task near the top edge scrolls back up", async ({ page }) => {
		await mount(page, LONG_LIST);
		await page.locator(".pm-container").evaluate((el) => { el.scrollTop = el.scrollHeight; });
		const finger = await Finger.on(page);
		const leaf = (await page.locator("#leaf").boundingBox())!;
		expect((await boxOf(page, "Mover")).y, "First task starts off-screen").toBeLessThan(leaf.y);

		const start = await centerOf(page, "Last");
		await finger.longPress(start);
		await finger.moveTo({ x: start.x, y: leaf.y + 15 });
		expect(await waitForScrollToSettle(page, ".pm-container")).toBe(0);

		await finger.moveTo(await upperPartOf(page, "Mover"));
		await finger.up();

		expect(await stored(page, "q1")).toEqual(["Last", ...LONG_LIST.q1]);
	});

	test("auto-scroll stops as soon as the finger lifts", async ({ page }) => {
		await mount(page, LONG_LIST);
		const finger = await Finger.on(page);
		const leaf = (await page.locator("#leaf").boundingBox())!;

		const start = await centerOf(page, "Mover");
		await finger.longPress(start);
		await finger.moveTo({ x: start.x, y: leaf.y + leaf.height - 15 });
		await page.waitForTimeout(150);
		await finger.up();

		const atRelease = await scrollTopOf(page, ".pm-container");
		await page.waitForTimeout(250);
		expect(await scrollTopOf(page, ".pm-container")).toBe(atRelease);
	});

	test("a plain tap still opens the task for editing", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"] });

		await taskLocator(page, "Alpha").locator(".pm-task-content").tap();

		await expect(page.locator(".pm-task-editing .pm-task-input")).toBeVisible();
		await expect(page.locator(".pm-touch-clone")).toHaveCount(0);
	});

	test("the edit field can still be typed into", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"] });
		await taskLocator(page, "Alpha").locator(".pm-task-content").tap();

		const input = page.locator(".pm-task-editing .pm-task-input");
		await input.fill("Renamed");
		await input.press("Enter");

		expect(await rendered(page, "q1")).toEqual(["Renamed", "Bravo"]);
	});
});

// ==================== Phone: touch-friendliness of the task rows ====================

test.describe("Phone — task rows stay touch-friendly", () => {
	test.beforeEach(({ isMobile }) => {
		test.skip(!isMobile, "Touch tests run on the phone viewports");
	});

	test("task text cannot be selected, so a long-press drags instead", async ({ page }) => {
		await mount(page, { q1: ["Alpha"] });
		const userSelect = await taskLocator(page, "Alpha").evaluate((el) => getComputedStyle(el).userSelect);
		expect(userSelect).toBe("none");
	});

	test("text in the edit field stays selectable", async ({ page }) => {
		await mount(page, { q1: ["Alpha"] });
		await taskLocator(page, "Alpha").locator(".pm-task-content").tap();
		const userSelect = await page.locator(".pm-task-editing .pm-task-input").evaluate(
			(el) => getComputedStyle(el).userSelect
		);
		expect(userSelect).toBe("text");
	});

	test("tasks keep a 44px tap target after being reordered", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);
		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up();

		for (const title of ["Alpha", "Bravo", "Charlie"]) {
			expect((await boxOf(page, title)).height, `${title} height`).toBeGreaterThanOrEqual(44);
		}
	});

	test("the drop indicator never causes sideways scrolling", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);
		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(1);

		const overflowX = await page.locator(".pm-container").evaluate((el) => el.scrollWidth - el.clientWidth);
		await finger.up();

		expect(overflowX).toBeLessThanOrEqual(0);
	});
});

// ==================== Desktop: mouse drag ====================

test.describe("Desktop — reorder tasks by mouse drag", () => {
	test.beforeEach(({ isMobile }) => {
		test.skip(!!isMobile, "Mouse tests run on the desktop viewport");
	});

	async function startDrag(page: Page, title: string): Promise<void> {
		const from = await centerOf(page, title);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
	}

	async function dragOver(page: Page, point: Point): Promise<void> {
		// Two moves: the first starts the native drag, the second delivers dragover
		await page.mouse.move(point.x, point.y - 1, { steps: 8 });
		await page.mouse.move(point.x, point.y, { steps: 2 });
	}

	test("dragging the first task below the last moves it to the end", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });

		await startDrag(page, "Alpha");
		await dragOver(page, await lowerPartOf(page, "Charlie"));
		await page.mouse.up();

		expect(await rendered(page, "q1")).toEqual(["Bravo", "Charlie", "Alpha"]);
		expect(await stored(page, "q1")).toEqual(["Bravo", "Charlie", "Alpha"]);
		expect(await saveCount(page)).toBe(1);
	});

	test("dragging the last task above the first moves it to the top", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });

		await startDrag(page, "Charlie");
		await dragOver(page, await upperPartOf(page, "Alpha"));
		await page.mouse.up();

		expect(await rendered(page, "q1")).toEqual(["Charlie", "Alpha", "Bravo"]);
	});

	test("the drop indicator shows between the right two tasks while dragging", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie", "Delta"] });

		await startDrag(page, "Delta");
		await dragOver(page, await upperPartOf(page, "Bravo"));

		const indicator = page.locator(".pm-drop-indicator");
		await expect(indicator).toHaveCount(1);
		const indicatorY = (await indicator.boundingBox())!.y;
		const alpha = await boxOf(page, "Alpha");
		const bravo = await boxOf(page, "Bravo");
		expect(indicatorY).toBeGreaterThanOrEqual(alpha.y + alpha.height);
		expect(indicatorY).toBeLessThanOrEqual(bravo.y + 0.5);

		await page.mouse.up();
		await expect(page.locator(".pm-drop-indicator")).toHaveCount(0);
	});

	test("dropping a task where it started changes nothing and does not save", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });

		await startDrag(page, "Bravo");
		await dragOver(page, await lowerPartOf(page, "Alpha"));
		await page.mouse.up();

		expect(await rendered(page, "q1")).toEqual(["Alpha", "Bravo", "Charlie"]);
		expect(await saveCount(page)).toBe(0);
	});

	test("dragging into another quadrant inserts at the drop position", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"], q4: ["Xray", "Yankee", "Zulu"] });

		await startDrag(page, "Alpha");
		await dragOver(page, await upperPartOf(page, "Zulu"));
		await page.mouse.up();

		expect(await rendered(page, "q4")).toEqual(["Xray", "Yankee", "Alpha", "Zulu"]);
		expect(await rendered(page, "q1")).toEqual(["Bravo"]);
	});

	test("dragging into an empty quadrant moves the task there", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"] });
		const q3 = (await page.locator('[data-quadrant="q3"]').boundingBox())!;

		await startDrag(page, "Bravo");
		await dragOver(page, { x: q3.x + q3.width / 2, y: q3.y + q3.height / 2 });
		await page.mouse.up();

		expect(await rendered(page, "q3")).toEqual(["Bravo"]);
	});
});

// ==================== Tablet: touch on the 2x2 grid ====================

test.describe("Tablet — touch drag on the two-column grid", () => {
	test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });

	test.beforeEach(({}, testInfo) => {
		// The viewport is overridden above, so one project is enough
		test.skip(testInfo.project.name !== "desktop", "Runs once, with its own tablet viewport");
	});

	test("the grid is two columns at this width", async ({ page }) => {
		await mount(page, { q1: ["Alpha"], q2: ["Xray"] });
		const alpha = await boxOf(page, "Alpha");
		const xray = await boxOf(page, "Xray");
		expect(xray.x).toBeGreaterThan(alpha.x + alpha.width);
	});

	test("long-press drag reorders within a quadrant", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo", "Charlie"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await lowerPartOf(page, "Charlie"));
		await finger.up();

		expect(await rendered(page, "q1")).toEqual(["Bravo", "Charlie", "Alpha"]);
	});

	test("long-press drag across columns inserts at the drop position", async ({ page }) => {
		await mount(page, { q1: ["Alpha", "Bravo"], q2: ["Xray", "Yankee"] });
		const finger = await Finger.on(page);

		await finger.longPress(await centerOf(page, "Alpha"));
		await finger.moveTo(await upperPartOf(page, "Yankee"));
		await finger.up();

		expect(await rendered(page, "q2")).toEqual(["Xray", "Alpha", "Yankee"]);
	});

	test("holding near the bottom of an overflowing quadrant scrolls that quadrant's list", async ({ page }) => {
		const many = Array.from({ length: 24 }, (_, i) => `Item-${String(i + 1).padStart(2, "0")}`);
		await mount(page, { q1: many });
		const listSelector = '[data-quadrant="q1"] .pm-task-list';
		const list = (await page.locator(listSelector).boundingBox())!;
		const finger = await Finger.on(page);

		const start = await centerOf(page, "Item-01");
		await finger.longPress(start);
		await finger.moveTo({ x: start.x, y: list.y + list.height - 15 });
		expect(await waitForScrollToSettle(page, listSelector)).toBeGreaterThan(100);

		await finger.moveTo(await lowerPartOf(page, "Item-24"));
		await finger.up();

		expect(await stored(page, "q1")).toEqual([...many.slice(1), "Item-01"]);
	});
});
