import { test, expect } from "@playwright/test";
import path from "path";

const fixtureUrl = "file://" + path.resolve(__dirname, "fixtures/matrix.html").replace(/\\/g, "/");

test.describe("Mobile layout — empty state", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
	});

	test("all four quadrants are visible (height >= 40px)", async ({ page }) => {
		const quadrants = page.locator("#empty-state .pm-quadrant");
		await expect(quadrants).toHaveCount(4);

		for (let i = 0; i < 4; i++) {
			const box = await quadrants.nth(i).boundingBox();
			expect(box, `Quadrant ${i + 1} should have a bounding box`).not.toBeNull();
			// Empty quadrants on mobile are collapsed to header-only (~57px)
			expect(box!.height, `Quadrant ${i + 1} height`).toBeGreaterThanOrEqual(40);
		}
	});

	test("quadrant headers are visible (height >= 30px)", async ({ page }) => {
		const headers = page.locator("#empty-state .pm-quadrant-header");
		await expect(headers).toHaveCount(4);

		for (let i = 0; i < 4; i++) {
			const box = await headers.nth(i).boundingBox();
			expect(box, `Header ${i + 1} should have a bounding box`).not.toBeNull();
			expect(box!.height, `Header ${i + 1} height`).toBeGreaterThanOrEqual(30);
		}
	});

	test("add buttons meet 44x44 mobile tap target", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const buttons = page.locator("#empty-state .pm-add-btn");
		await expect(buttons).toHaveCount(4);

		for (let i = 0; i < 4; i++) {
			const box = await buttons.nth(i).boundingBox();
			expect(box, `Button ${i + 1} should have a bounding box`).not.toBeNull();
			expect(box!.width, `Button ${i + 1} width`).toBeGreaterThanOrEqual(44);
			expect(box!.height, `Button ${i + 1} height`).toBeGreaterThanOrEqual(44);
		}
	});

	test("grid is scrollable (not overflow hidden)", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const overflow = await page.locator("#empty-state .pm-grid").evaluate(
			(el) => getComputedStyle(el).overflowY
		);
		expect(overflow).not.toBe("hidden");
	});
});

test.describe("Mobile layout — form open with task", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
	});

	test("task items meet 44px mobile tap target height", async ({ page }) => {
		const task = page.locator("#form-open-state .pm-task").first();
		const box = await task.boundingBox();
		expect(box, "Task should have a bounding box").not.toBeNull();
		expect(box!.height, "Task height").toBeGreaterThanOrEqual(44);
	});

	test("open add form is visible within viewport", async ({ page }) => {
		const form = page.locator("#form-open-state .pm-add-form:not(.pm-hidden)");
		const box = await form.boundingBox();
		expect(box, "Form should have a bounding box").not.toBeNull();
		expect(box!.height, "Form height").toBeGreaterThan(0);
		expect(box!.width, "Form width").toBeGreaterThan(0);
	});

	test("form submit button is visible", async ({ page }) => {
		const btn = page.locator("#form-open-state .pm-add-form:not(.pm-hidden) .pm-form-submit");
		const box = await btn.boundingBox();
		expect(box, "Submit button should have a bounding box").not.toBeNull();
		expect(box!.height, "Submit button height").toBeGreaterThan(0);
	});
});

test.describe("Mobile layout — constrained Obsidian workspace", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
		// Simulate Obsidian's workspace leaf with a small fixed height (300px).
		// On mobile with keyboard + Obsidian chrome, space is very tight.
		await page.locator("#empty-state").evaluate((el) => {
			el.style.height = "300px";
		});
	});

	test("quadrants are still visible even in a 300px container", async ({ page }) => {
		const quadrants = page.locator("#empty-state .pm-quadrant");

		for (let i = 0; i < 4; i++) {
			const box = await quadrants.nth(i).boundingBox();
			expect(box, `Quadrant ${i + 1} should have a bounding box`).not.toBeNull();
			// Empty quadrants on mobile are collapsed to header-only (~57px)
			expect(box!.height, `Quadrant ${i + 1} should not collapse`).toBeGreaterThanOrEqual(40);
		}
	});

	test("quadrant headers remain visible in constrained container", async ({ page }) => {
		const headers = page.locator("#empty-state .pm-quadrant-header");

		for (let i = 0; i < 4; i++) {
			const box = await headers.nth(i).boundingBox();
			expect(box, `Header ${i + 1} should have a bounding box`).not.toBeNull();
			expect(box!.height, `Header ${i + 1} should not collapse`).toBeGreaterThanOrEqual(30);
		}
	});

	test("add form is usable when opened in constrained container", async ({ page }) => {
		await page.locator("#empty-state .pm-quadrant-q1 .pm-add-form").evaluate((el) => {
			el.classList.remove("pm-hidden");
		});

		const form = page.locator("#empty-state .pm-quadrant-q1 .pm-add-form");
		const box = await form.boundingBox();
		expect(box, "Add form should have a bounding box").not.toBeNull();
		expect(box!.height, "Add form should be visible").toBeGreaterThan(50);
	});
});

test.describe("Desktop layout — overloaded quadrant scrolls", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
	});

	test("Q1 task-list is scrollable when overloaded with tasks", async ({ page, isMobile }) => {
		test.skip(!!isMobile, "Desktop-only test");

		const result = await page.locator("#overloaded-state .pm-quadrant-q1 .pm-task-list").evaluate((el) => {
			return {
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
			};
		});

		expect(result.scrollHeight, "Task list should overflow and be scrollable").toBeGreaterThan(result.clientHeight);
	});
});

test.describe("Axis labels", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
	});

	test("importance axis label is hidden on mobile", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const display = await page.locator("#empty-state .pm-axis-importance").evaluate(
			(el) => getComputedStyle(el).display
		);
		expect(display).toBe("none");
	});

	test("importance axis label is visible on desktop", async ({ page, isMobile }) => {
		test.skip(!!isMobile, "Desktop-only test");
		const box = await page.locator("#populated-state .pm-axis-importance").boundingBox();
		expect(box, "Importance label should have a bounding box").not.toBeNull();
		expect(box!.width, "Importance label width").toBeGreaterThan(0);
		expect(box!.height, "Importance label height").toBeGreaterThan(0);
	});

	test("mobile layout still uses flex column on matrix wrapper", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const display = await page.locator("#empty-state .pm-matrix-wrapper").evaluate(
			(el) => getComputedStyle(el).display
		);
		expect(display).toBe("flex");
	});
});

test.describe("Mobile layout — scrollable container, no inner clipping", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(fixtureUrl);
	});

	test("pm-container fills leaf and scrolls (not height:auto)", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const result = await page.locator("#empty-state .pm-container").evaluate((el) => {
			const style = getComputedStyle(el);
			return {
				overflowY: style.overflowY,
				ownHeight: el.getBoundingClientRect().height,
				parentHeight: el.parentElement!.getBoundingClientRect().height,
			};
		});
		// Container should fill its parent (Obsidian leaf), not extend beyond it
		expect(result.ownHeight, "Container should fill the leaf, not overflow it").toBeLessThanOrEqual(result.parentHeight + 1);
		// Container should scroll
		expect(result.overflowY, "Container should scroll").not.toBe("hidden");
	});

	test("pm-matrix-wrapper does not clip overflow on mobile", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const overflow = await page.locator("#empty-state .pm-matrix-wrapper").evaluate(
			(el) => getComputedStyle(el).overflowY
		);
		expect(overflow, "Matrix wrapper should not clip content").not.toBe("hidden");
	});

	test("inner elements use natural height (no flex:1 constraining)", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const result = await page.locator("#empty-state .pm-matrix-wrapper").evaluate((el) => {
			const style = getComputedStyle(el);
			return {
				flex: style.flex,
				flexGrow: style.flexGrow,
			};
		});
		// flex: none means flex-grow: 0 — wrapper should not be constrained by container height
		expect(result.flexGrow, "Matrix wrapper should not use flex-grow").toBe("0");
	});

	test("pm-quadrant does not clip overflow on mobile", async ({ page, isMobile }) => {
		test.skip(!isMobile, "Mobile-only test");
		const quadrants = page.locator("#empty-state .pm-quadrant");
		for (let i = 0; i < 4; i++) {
			const overflow = await quadrants.nth(i).evaluate(
				(el) => getComputedStyle(el).overflowY
			);
			expect(overflow, `Quadrant ${i + 1} should not clip content`).not.toBe("hidden");
		}
	});

	test("pm-quadrant has no max-height on mobile", async ({ page }) => {
		const quadrants = page.locator("#empty-state .pm-quadrant");
		for (let i = 0; i < 4; i++) {
			const maxHeight = await quadrants.nth(i).evaluate(
				(el) => getComputedStyle(el).maxHeight
			);
			expect(maxHeight, `Quadrant ${i + 1} should have no max-height`).toBe("none");
		}
	});

	test("container is scrollable when form is open in constrained leaf", async ({ page }) => {
		// Open the form in Q1
		await page.locator("#empty-state .pm-quadrant-q1 .pm-add-form").evaluate((el) => {
			el.classList.remove("pm-hidden");
		});

		// Also open form in Q3 to ensure enough content to overflow
		await page.locator("#empty-state .pm-quadrant-q3 .pm-add-form").evaluate((el) => {
			el.classList.remove("pm-hidden");
		});

		const result = await page.locator("#empty-state .pm-container").evaluate((el) => {
			return {
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
				overflowY: getComputedStyle(el).overflowY,
			};
		});

		// When forms are open, content should exceed container → scrollable
		if (result.scrollHeight > result.clientHeight) {
			expect(["auto", "scroll"]).toContain(result.overflowY);
		}
	});
});
