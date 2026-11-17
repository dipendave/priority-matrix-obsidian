/**
 * @jest-environment jsdom
 *
 * Integration tests for PriorityMatrixView — covers all user-facing
 * interactions through the view layer to prevent regressions in core
 * functionality (add, edit, delete, undo, drag, rendering, persistence).
 */

import { PriorityMatrixView } from "../src/view";
import PriorityMatrixPlugin from "../src/main";
import { Quadrant, DEFAULT_DATA, QUADRANT_META, QUADRANT_COLORS, VIEW_TYPE_PRIORITY } from "../src/types";
import { Notice, Platform } from "obsidian";

// ==================== Helpers ====================

function flushPromises(): Promise<void> {
	return new Promise((resolve) => process.nextTick(resolve));
}

function createPlugin(): PriorityMatrixPlugin {
	const plugin = new PriorityMatrixPlugin({} as any, {} as any);
	plugin.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
	plugin.saveData = jest.fn().mockResolvedValue(undefined);
	plugin.loadData = jest.fn().mockResolvedValue(null);
	return plugin;
}

function createView(plugin: PriorityMatrixPlugin): PriorityMatrixView {
	const view = new PriorityMatrixView({} as any, plugin);
	return view;
}

/** Add a task via the plugin and re-render the view */
function addTaskAndRender(view: PriorityMatrixView, plugin: PriorityMatrixPlugin, title: string, quadrant: Quadrant, dueDate: string | null = null) {
	plugin.addTask(title, quadrant, dueDate);
	view.renderMatrix();
}

/** Query helpers */
function getQuadrants(view: PriorityMatrixView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll(".pm-quadrant"));
}

function getQuadrantByType(view: PriorityMatrixView, q: Quadrant): HTMLElement {
	return view.contentEl.querySelector(`[data-quadrant="${q}"]`) as HTMLElement;
}

function getTaskElements(view: PriorityMatrixView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll(".pm-task"));
}

function getTasksInQuadrant(view: PriorityMatrixView, q: Quadrant): HTMLElement[] {
	const qEl = getQuadrantByType(view, q);
	return qEl ? Array.from(qEl.querySelectorAll(".pm-task")) : [];
}

function getAddButton(view: PriorityMatrixView, q: Quadrant): HTMLElement {
	const qEl = getQuadrantByType(view, q);
	return qEl.querySelector(".pm-add-btn") as HTMLElement;
}

function getAddForm(view: PriorityMatrixView, q: Quadrant): HTMLElement {
	const qEl = getQuadrantByType(view, q);
	return qEl.querySelector(".pm-add-form") as HTMLElement;
}

function getFormInput(form: HTMLElement): HTMLInputElement {
	return form.querySelector(".pm-task-input") as HTMLInputElement;
}

function getFormDateInput(form: HTMLElement): HTMLInputElement {
	return form.querySelector(".pm-date-input") as HTMLInputElement;
}

function getFormSubmitBtn(form: HTMLElement): HTMLElement {
	return form.querySelector(".pm-form-submit") as HTMLElement;
}

function getFormCancelBtn(form: HTMLElement): HTMLElement {
	return form.querySelector(".pm-form-cancel") as HTMLElement;
}

// ==================== Layout helpers ====================
// jsdom has no layout engine: every getBoundingClientRect() is all zeros. The
// drag code positions things by geometry, so these helpers hand each quadrant
// and task a rectangle that matches a simple stacked layout.

const QUADRANT_ORIGIN: Record<Quadrant, { left: number; top: number }> = {
	[Quadrant.Q1]: { left: 0, top: 0 },
	[Quadrant.Q2]: { left: 300, top: 0 },
	[Quadrant.Q3]: { left: 0, top: 500 },
	[Quadrant.Q4]: { left: 300, top: 500 },
};
const QUADRANT_WIDTH = 280;
const QUADRANT_HEIGHT = 480;
const TASK_HEIGHT = 40;
const TASK_PITCH = 50; // 40px task + 10px gap
const FIRST_TASK_OFFSET = 50; // header height

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		left, top, width, height,
		right: left + width,
		bottom: top + height,
		x: left, y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

/** Top edge of the task at `index` in a quadrant */
function taskTop(q: Quadrant, index: number): number {
	return QUADRANT_ORIGIN[q].top + FIRST_TASK_OFFSET + index * TASK_PITCH;
}

/** A point in the upper half of the task at `index` — a drop here lands before it */
function aboveMiddleOf(q: Quadrant, index: number): { x: number; y: number } {
	return { x: QUADRANT_ORIGIN[q].left + 100, y: taskTop(q, index) + 5 };
}

/** A point in the lower half of the task at `index` — a drop here lands after it */
function belowMiddleOf(q: Quadrant, index: number): { x: number; y: number } {
	return { x: QUADRANT_ORIGIN[q].left + 100, y: taskTop(q, index) + TASK_HEIGHT - 5 };
}

/** A point inside a quadrant but below every task in it */
function bottomOf(q: Quadrant): { x: number; y: number } {
	return { x: QUADRANT_ORIGIN[q].left + 100, y: QUADRANT_ORIGIN[q].top + QUADRANT_HEIGHT - 10 };
}

/** Give the currently rendered quadrants and tasks their rectangles. Call again after a re-render. */
function mockLayout(view: PriorityMatrixView): void {
	for (const q of Object.values(Quadrant)) {
		const qEl = getQuadrantByType(view, q);
		if (!qEl) continue;
		const origin = QUADRANT_ORIGIN[q];
		qEl.getBoundingClientRect = () => makeRect(origin.left, origin.top, QUADRANT_WIDTH, QUADRANT_HEIGHT);
		getTasksInQuadrant(view, q).forEach((taskEl, i) => {
			taskEl.getBoundingClientRect = () => makeRect(origin.left + 10, taskTop(q, i), QUADRANT_WIDTH - 20, TASK_HEIGHT);
		});
	}
}

/** Titles of the rendered tasks in a quadrant, top to bottom */
function renderedTitles(view: PriorityMatrixView, q: Quadrant): string[] {
	return getTasksInQuadrant(view, q).map((el) => el.querySelector(".pm-task-title")!.textContent || "");
}

/** Titles of the stored active tasks in a quadrant, in order */
function storedTitles(plugin: PriorityMatrixPlugin, q: Quadrant): string[] {
	return plugin.getTasksForQuadrant(q).map((t) => t.title);
}

function getTaskElByTitle(view: PriorityMatrixView, title: string): HTMLElement {
	const found = getTaskElements(view).find((el) => el.querySelector(".pm-task-title")?.textContent === title);
	if (!found) throw new Error(`No rendered task titled "${title}"`);
	return found;
}

function getIndicators(view: PriorityMatrixView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll(".pm-drop-indicator"));
}

/** Title of the task the drop indicator sits directly above, or null if it is at the end of a list */
function indicatorIsAbove(view: PriorityMatrixView): string | null {
	const indicator = getIndicators(view)[0];
	if (!indicator) throw new Error("No drop indicator is showing");
	let next = indicator.nextElementSibling;
	// The dragged task stays in the list while dragging; the indicator's position
	// is relative to the tasks that are staying put.
	while (next && next.classList.contains("pm-dragging")) next = next.nextElementSibling;
	return next ? next.querySelector(".pm-task-title")!.textContent : null;
}

/** Seed one quadrant with tasks, render, and apply the synthetic layout */
function setupWithTasks(tasksByQuadrant: Partial<Record<Quadrant, string[]>>) {
	const plugin = createPlugin();
	const view = createView(plugin);
	for (const [q, names] of Object.entries(tasksByQuadrant)) {
		for (const name of names!) plugin.addTask(name, q as Quadrant, null);
	}
	view.renderMatrix();
	mockLayout(view);
	return { plugin, view };
}

// ==================== Setup ====================

beforeEach(() => {
	Notice.clear();
	// Reset Platform to desktop
	(Platform as any).isMobile = false;
	(Platform as any).isDesktop = true;
	// Mock requestAnimationFrame (used by updateOverflowIndicators)
	global.requestAnimationFrame = jest.fn((cb) => { cb(0); return 0; }) as any;
});

afterEach(() => {
	jest.restoreAllMocks();
});

// ==================== A. View Identity & Lifecycle ====================

describe("view identity", () => {
	it("returns correct view type", () => {
		const view = createView(createPlugin());
		expect(view.getViewType()).toBe(VIEW_TYPE_PRIORITY);
	});

	it("returns correct display text", () => {
		const view = createView(createPlugin());
		expect(view.getDisplayText()).toBe("Task priority matrix");
	});

	it("returns correct icon", () => {
		const view = createView(createPlugin());
		expect(view.getIcon()).toBe("layout-grid");
	});

	it("stores plugin reference", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		expect(view.plugin).toBe(plugin);
	});
});

describe("view lifecycle", () => {
	it("onOpen renders the matrix", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const spy = jest.spyOn(view, "renderMatrix");

		await view.onOpen();

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("onOpen shows drag hint on mobile first time", async () => {
		(Platform as any).isMobile = true;
		const plugin = createPlugin();
		plugin.data.hasSeenDragHint = false;
		const view = createView(plugin);

		await view.onOpen();

		expect(Notice.instances).toHaveLength(1);
		expect(Notice.instances[0].message).toBe("Long-press a task to reorder it or drag it between quadrants");
		expect(Notice.instances[0].duration).toBe(5000);
	});

	it("onOpen sets hasSeenDragHint flag after showing hint", async () => {
		(Platform as any).isMobile = true;
		const plugin = createPlugin();
		plugin.data.hasSeenDragHint = false;
		const view = createView(plugin);

		await view.onOpen();

		expect(plugin.data.hasSeenDragHint).toBe(true);
	});

	it("onOpen does not show drag hint on desktop", async () => {
		(Platform as any).isMobile = false;
		const plugin = createPlugin();
		plugin.data.hasSeenDragHint = false;
		const view = createView(plugin);

		await view.onOpen();

		expect(Notice.instances).toHaveLength(0);
	});

	it("onOpen does not show drag hint if already seen", async () => {
		(Platform as any).isMobile = true;
		const plugin = createPlugin();
		plugin.data.hasSeenDragHint = true;
		const view = createView(plugin);

		await view.onOpen();

		expect(Notice.instances).toHaveLength(0);
	});

	it("onClose cleans up touch drag state", async () => {
		const view = createView(createPlugin());
		// Access private method through any
		const spy = jest.spyOn(view as any, "cleanupTouchDrag");

		await view.onClose();

		expect(spy).toHaveBeenCalledTimes(1);
	});
});

// ==================== B. Matrix Rendering Structure ====================

describe("matrix rendering", () => {
	it("renders exactly 4 quadrants", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		expect(getQuadrants(view)).toHaveLength(4);
	});

	it("renders quadrants in correct order (Q1, Q2, Q3, Q4)", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const quadrants = getQuadrants(view);
		expect(quadrants[0].getAttribute("data-quadrant")).toBe("q1");
		expect(quadrants[1].getAttribute("data-quadrant")).toBe("q2");
		expect(quadrants[2].getAttribute("data-quadrant")).toBe("q3");
		expect(quadrants[3].getAttribute("data-quadrant")).toBe("q4");
	});

	it("applies correct color class to each quadrant", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		for (const q of [Quadrant.Q1, Quadrant.Q2, Quadrant.Q3, Quadrant.Q4]) {
			const qEl = getQuadrantByType(view, q);
			expect(qEl.classList.contains(QUADRANT_META[q].colorClass)).toBe(true);
		}
	});

	it("renders urgency axis labels", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const urgency = view.contentEl.querySelector(".pm-axis-urgency");
		expect(urgency).toBeTruthy();
		expect(urgency!.textContent).toContain("URGENT");
		expect(urgency!.textContent).toContain("NOT URGENT");
	});

	it("renders importance axis labels", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const importance = view.contentEl.querySelector(".pm-axis-importance");
		expect(importance).toBeTruthy();
		expect(importance!.textContent).toContain("IMPORTANT");
		expect(importance!.textContent).toContain("NOT IMPORTANT");
	});

	it("renders quadrant header with action text", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		for (const q of [Quadrant.Q1, Quadrant.Q2, Quadrant.Q3, Quadrant.Q4]) {
			const qEl = getQuadrantByType(view, q);
			const action = qEl.querySelector(".pm-quadrant-action");
			expect(action).toBeTruthy();
			expect(action!.textContent).toContain(QUADRANT_META[q].action);
		}
	});

	it("renders add button per quadrant", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		for (const q of [Quadrant.Q1, Quadrant.Q2, Quadrant.Q3, Quadrant.Q4]) {
			const btn = getAddButton(view, q);
			expect(btn).toBeTruthy();
			expect(btn.getAttribute("aria-label")).toBe(`Add task to ${QUADRANT_META[q].action}`);
		}
	});

	it("clears previous content on re-render", () => {
		const view = createView(createPlugin());
		view.renderMatrix();
		view.renderMatrix();

		// Should still have exactly 4 quadrants, not 8
		expect(getQuadrants(view)).toHaveLength(4);
	});

	it("applies pm-container class to contentEl", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		expect(view.contentEl.classList.contains("pm-container")).toBe(true);
	});
});

// ==================== C. Empty & Populated State ====================

describe("empty state", () => {
	it("shows empty state text when quadrant has no tasks", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const qEl = getQuadrantByType(view, Quadrant.Q1);
		const emptyState = qEl.querySelector(".pm-empty-state");
		expect(emptyState).toBeTruthy();
		expect(emptyState!.textContent).toBe("Tap + to add, tap a task to edit");
	});

	it("applies pm-quadrant-empty class when no tasks", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const qEl = getQuadrantByType(view, Quadrant.Q1);
		expect(qEl.classList.contains("pm-quadrant-empty")).toBe(true);
	});

	it("does not show empty state when tasks exist", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task 1", Quadrant.Q1);

		const qEl = getQuadrantByType(view, Quadrant.Q1);
		const emptyState = qEl.querySelector(".pm-empty-state");
		expect(emptyState).toBeNull();
	});

	it("does not apply pm-quadrant-empty when tasks exist", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task 1", Quadrant.Q1);

		const qEl = getQuadrantByType(view, Quadrant.Q1);
		expect(qEl.classList.contains("pm-quadrant-empty")).toBe(false);
	});
});

// ==================== D. Task Count Badge ====================

describe("task count badge", () => {
	it("shows badge when tasks exist", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task 1", Quadrant.Q1);

		const badge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
		expect(badge).toBeTruthy();
		expect(badge!.textContent!.trim()).toBe("1");
	});

	it("shows correct count for multiple tasks", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		plugin.addTask("Task 1", Quadrant.Q2, null);
		plugin.addTask("Task 2", Quadrant.Q2, null);
		plugin.addTask("Task 3", Quadrant.Q2, null);
		view.renderMatrix();

		const badge = getQuadrantByType(view, Quadrant.Q2).querySelector(".pm-task-count");
		expect(badge!.textContent!.trim()).toBe("3");
	});

	it("does not show badge for empty quadrant", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const badge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
		expect(badge).toBeNull();
	});

	it("counts only tasks in the correct quadrant", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		plugin.addTask("Q1", Quadrant.Q1, null);
		plugin.addTask("Q2", Quadrant.Q2, null);
		plugin.addTask("Q2b", Quadrant.Q2, null);
		view.renderMatrix();

		const q1Badge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
		const q2Badge = getQuadrantByType(view, Quadrant.Q2).querySelector(".pm-task-count");
		expect(q1Badge!.textContent!.trim()).toBe("1");
		expect(q2Badge!.textContent!.trim()).toBe("2");
	});
});

// ==================== E. Task Rendering ====================

describe("task rendering", () => {
	it("renders task with correct title", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Buy groceries", Quadrant.Q1);

		const title = view.contentEl.querySelector(".pm-task-title");
		expect(title!.textContent).toBe("Buy groceries");
	});

	it("renders task with data-task-id attribute", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Test", Quadrant.Q1, null);
		view.renderMatrix();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`);
		expect(taskEl).toBeTruthy();
	});

	it("renders drag handle", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Test", Quadrant.Q1);

		const handle = view.contentEl.querySelector(".pm-task-drag-handle");
		expect(handle).toBeTruthy();
		expect(handle!.textContent).toBe("\u2630");
	});

	it("renders delete button with × character", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Test", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete");
		expect(deleteBtn).toBeTruthy();
		expect(deleteBtn!.textContent).toBe("\u00d7");
	});

	it("renders task as draggable", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Test", Quadrant.Q1);

		const taskEl = view.contentEl.querySelector(".pm-task");
		expect(taskEl!.getAttribute("draggable")).toBe("true");
	});

	it("renders due date when present", () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));

		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1, "2025-06-15");

		const dueEl = view.contentEl.querySelector(".pm-task-due");
		expect(dueEl).toBeTruthy();
		expect(dueEl!.textContent).toBe("Today");

		jest.useRealTimers();
	});

	it("does not render due date element when null", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1, null);

		const dueEl = view.contentEl.querySelector(".pm-task-due");
		expect(dueEl).toBeNull();
	});

	it("applies pm-overdue class for past due dates", () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));

		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Overdue task", Quadrant.Q1, "2025-06-10");

		const dueEl = view.contentEl.querySelector(".pm-task-due");
		expect(dueEl!.classList.contains("pm-overdue")).toBe(true);

		jest.useRealTimers();
	});

	it("does not apply pm-overdue for future dates", () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));

		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Future task", Quadrant.Q1, "2025-06-20");

		const dueEl = view.contentEl.querySelector(".pm-task-due");
		expect(dueEl!.classList.contains("pm-overdue")).toBe(false);

		jest.useRealTimers();
	});

	it("renders tasks in the correct quadrant", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		plugin.addTask("Q1 task", Quadrant.Q1, null);
		plugin.addTask("Q3 task", Quadrant.Q3, null);
		view.renderMatrix();

		expect(getTasksInQuadrant(view, Quadrant.Q1)).toHaveLength(1);
		expect(getTasksInQuadrant(view, Quadrant.Q2)).toHaveLength(0);
		expect(getTasksInQuadrant(view, Quadrant.Q3)).toHaveLength(1);
		expect(getTasksInQuadrant(view, Quadrant.Q4)).toHaveLength(0);
	});

	it("renders multiple tasks in correct order", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		plugin.addTask("First", Quadrant.Q1, null);
		plugin.addTask("Second", Quadrant.Q1, null);
		plugin.addTask("Third", Quadrant.Q1, null);
		view.renderMatrix();

		const tasks = getTasksInQuadrant(view, Quadrant.Q1);
		const titles = tasks.map((t) => t.querySelector(".pm-task-title")!.textContent);
		expect(titles).toEqual(["First", "Second", "Third"]);
	});
});

// ==================== F. Add Task Flow (UI) ====================

describe("add task flow", () => {
	it("add form is hidden by default", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		expect(form.classList.contains("pm-hidden")).toBe(true);
	});

	it("clicking add button shows the form", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const btn = getAddButton(view, Quadrant.Q1);
		btn.click();

		const form = getAddForm(view, Quadrant.Q1);
		expect(form.classList.contains("pm-hidden")).toBe(false);
	});

	it("clicking add button again hides the form", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const btn = getAddButton(view, Quadrant.Q1);
		btn.click(); // show
		btn.click(); // hide

		const form = getAddForm(view, Quadrant.Q1);
		expect(form.classList.contains("pm-hidden")).toBe(true);
	});

	it("submitting with valid title adds a task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "New task";
		submitBtn.click();
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(1);
		expect(plugin.data.tasks[0].title).toBe("New task");
		expect(plugin.data.tasks[0].quadrant).toBe(Quadrant.Q1);
	});

	it("submitting with due date stores the date", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q2);
		const input = getFormInput(form);
		const dateInput = getFormDateInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "Dated task";
		dateInput.value = "2025-12-25";
		submitBtn.click();
		await flushPromises();

		expect(plugin.data.tasks[0].dueDate).toBe("2025-12-25");
	});

	it("submitting with empty title shows error", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "";
		submitBtn.click();

		expect(input.classList.contains("pm-input-error")).toBe(true);
	});

	it("typing clears error class", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "";
		submitBtn.click();
		expect(input.classList.contains("pm-input-error")).toBe(true);

		input.dispatchEvent(new Event("input"));
		expect(input.classList.contains("pm-input-error")).toBe(false);
	});

	it("cancel button clears form and hides it", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const btn = getAddButton(view, Quadrant.Q1);
		btn.click();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const cancelBtn = getFormCancelBtn(form);

		input.value = "Unsaved text";
		cancelBtn.click();

		expect(input.value).toBe("");
		expect(form.classList.contains("pm-hidden")).toBe(true);
	});

	it("Enter key submits the form", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);

		input.value = "Enter task";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(1);
		expect(plugin.data.tasks[0].title).toBe("Enter task");
	});

	it("Escape key hides the form", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const btn = getAddButton(view, Quadrant.Q1);
		btn.click();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(form.classList.contains("pm-hidden")).toBe(true);
	});

	it("form resets after successful add", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const dateInput = getFormDateInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "Reset test";
		dateInput.value = "2025-12-25";
		submitBtn.click();
		await flushPromises();

		// After re-render, get fresh form references
		const newForm = getAddForm(view, Quadrant.Q1);
		const newInput = getFormInput(newForm);
		const newDateInput = getFormDateInput(newForm);

		expect(newInput.value).toBe("");
		expect(newDateInput.value).toBe("");
	});

	it("new task gets pm-task-new highlight class", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "Highlighted task";
		submitBtn.click();
		await flushPromises();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${plugin.data.tasks[0].id}"]`);
		expect(taskEl!.classList.contains("pm-task-new")).toBe(true);
	});
});

// ==================== G. Edit Task Flow ====================

describe("edit task flow", () => {
	it("clicking task content enters edit mode", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Editable", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const editForm = view.contentEl.querySelector(".pm-edit-form");
		expect(editForm).toBeTruthy();
	});

	it("edit form pre-populates with current title", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Original title", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		expect(input.value).toBe("Original title");
	});

	it("edit form pre-populates with current due date", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1, "2025-12-25");

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const dateInput = view.contentEl.querySelector(".pm-edit-form .pm-date-input") as HTMLInputElement;
		expect(dateInput.value).toBe("2025-12-25");
	});

	it("edit form shows empty date for task without due date", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "No date", Quadrant.Q1, null);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const dateInput = view.contentEl.querySelector(".pm-edit-form .pm-date-input") as HTMLInputElement;
		expect(dateInput.value).toBe("");
	});

	it("saving edit updates the task title", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Old title", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		const saveBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-submit") as HTMLElement;

		input.value = "New title";
		saveBtn.click();
		await flushPromises();

		expect(plugin.data.tasks[0].title).toBe("New title");
	});

	it("saving edit with empty title shows error", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Has title", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		const saveBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-submit") as HTMLElement;

		input.value = "";
		saveBtn.click();

		expect(input.classList.contains("pm-input-error")).toBe(true);
		// Original title should be unchanged
		expect(plugin.data.tasks[0].title).toBe("Has title");
	});

	it("cancel discards changes and re-renders", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Keep me", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const cancelBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-cancel") as HTMLElement;
		cancelBtn.click();

		// Should be back to normal view, not edit form
		expect(view.contentEl.querySelector(".pm-edit-form")).toBeNull();
		expect(view.contentEl.querySelector(".pm-task-title")!.textContent).toBe("Keep me");
	});

	it("Enter key saves the edit", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Old", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		input.value = "Updated via Enter";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await flushPromises();

		expect(plugin.data.tasks[0].title).toBe("Updated via Enter");
	});

	it("Escape key cancels the edit", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Original", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		input.value = "Changed";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		// Task should still have original title
		expect(plugin.data.tasks[0].title).toBe("Original");
		expect(view.contentEl.querySelector(".pm-edit-form")).toBeNull();
	});

	it("disables dragging during edit", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const taskEl = view.contentEl.querySelector(".pm-task");
		expect(taskEl!.getAttribute("draggable")).toBe("false");
	});

	it("applies pm-task-editing class during edit", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const taskEl = view.contentEl.querySelector(".pm-task");
		expect(taskEl!.classList.contains("pm-task-editing")).toBe(true);
	});

	it("typing in edit form clears error class", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		const saveBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-submit") as HTMLElement;

		input.value = "";
		saveBtn.click();
		expect(input.classList.contains("pm-input-error")).toBe(true);

		input.dispatchEvent(new Event("input"));
		expect(input.classList.contains("pm-input-error")).toBe(false);
	});
});

// ==================== H. Delete & Undo Flow ====================

describe("delete and undo flow", () => {
	it("clicking delete removes the task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Delete me", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(0);
	});

	it("delete re-renders the matrix", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Delete me", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		// Matrix should show empty state now
		expect(view.contentEl.querySelector(".pm-empty-state")).toBeTruthy();
	});

	it("delete shows notice with undo option", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		expect(Notice.instances).toHaveLength(1);
		const notice = Notice.instances[0];
		expect(notice.duration).toBe(5000);

		// Fragment should contain "Task deleted." and an undo link
		const fragment = notice.message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link");
		expect(undoLink).toBeTruthy();
		expect(undoLink!.textContent).toBe("Undo");
	});

	it("undo restores the deleted task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Restore me", Quadrant.Q1);
		const originalId = plugin.data.tasks[0].id;

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();
		expect(plugin.data.tasks).toHaveLength(0);

		// Click undo
		const fragment = Notice.instances[0].message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link") as HTMLElement;
		undoLink.click();
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(1);
		expect(plugin.data.tasks[0].id).toBe(originalId);
		expect(plugin.data.tasks[0].title).toBe("Restore me");
	});

	it("undo re-renders the task in the matrix", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Visible again", Quadrant.Q2);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		const fragment = Notice.instances[0].message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link") as HTMLElement;
		undoLink.click();
		await flushPromises();

		// Task should be visible in the matrix again
		const title = view.contentEl.querySelector(".pm-task-title");
		expect(title!.textContent).toBe("Visible again");
	});

	it("delete does nothing for nonexistent task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		// Manually call handleDeleteTask with a bad ID
		await (view as any).handleDeleteTask("nonexistent-id");

		// No notice should be created
		expect(Notice.instances).toHaveLength(0);
	});
});

// ==================== I. Desktop Drag & Drop ====================

describe("desktop drag and drop", () => {
	function createDragEvent(type: string, taskId?: string): DragEvent {
		const event = new Event(type, { bubbles: true, cancelable: true }) as any;
		event.dataTransfer = {
			setData: jest.fn(),
			getData: jest.fn().mockReturnValue(taskId || ""),
			effectAllowed: "",
			dropEffect: "",
		};
		event.preventDefault = jest.fn();
		return event as DragEvent;
	}

	it("dragstart sets dataTransfer with task ID", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Drag me", Quadrant.Q1, null);
		view.renderMatrix();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
		const event = createDragEvent("dragstart");
		taskEl.dispatchEvent(event);

		expect(event.dataTransfer!.setData).toHaveBeenCalledWith("text/plain", task.id);
		expect(event.dataTransfer!.effectAllowed).toBe("move");
	});

	it("dragstart adds pm-dragging class", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Drag me", Quadrant.Q1, null);
		view.renderMatrix();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
		taskEl.dispatchEvent(createDragEvent("dragstart"));

		expect(taskEl.classList.contains("pm-dragging")).toBe(true);
	});

	it("dragend removes pm-dragging class", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Drag me", Quadrant.Q1, null);
		view.renderMatrix();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
		taskEl.dispatchEvent(createDragEvent("dragstart"));
		taskEl.dispatchEvent(createDragEvent("dragend"));

		expect(taskEl.classList.contains("pm-dragging")).toBe(false);
	});

	it("dragover on quadrant adds pm-drop-target class", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const q2El = getQuadrantByType(view, Quadrant.Q2);
		const event = createDragEvent("dragover");
		q2El.dispatchEvent(event);

		expect(q2El.classList.contains("pm-drop-target")).toBe(true);
		expect(event.preventDefault).toHaveBeenCalled();
	});

	it("drop on different quadrant moves the task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Move me", Quadrant.Q1, null);
		view.renderMatrix();

		const q2El = getQuadrantByType(view, Quadrant.Q2);
		const event = createDragEvent("drop", task.id);
		q2El.dispatchEvent(event);
		await flushPromises();

		expect(plugin.data.tasks[0].quadrant).toBe(Quadrant.Q2);
	});

	it("drop on same quadrant does not re-render", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Stay here", Quadrant.Q1, null);
		view.renderMatrix();

		const spy = jest.spyOn(view, "renderMatrix");
		const q1El = getQuadrantByType(view, Quadrant.Q1);
		q1El.dispatchEvent(createDragEvent("drop", task.id));

		// renderMatrix should NOT be called for same-quadrant drop
		expect(spy).not.toHaveBeenCalled();
	});

	it("dragend clears all drop-target highlights", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Drag me", Quadrant.Q1, null);
		view.renderMatrix();

		// Simulate dragover on Q2 to add highlight
		getQuadrantByType(view, Quadrant.Q2).dispatchEvent(createDragEvent("dragover"));

		// Then dragend
		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
		taskEl.dispatchEvent(createDragEvent("dragend"));

		const highlighted = view.contentEl.querySelectorAll(".pm-drop-target");
		expect(highlighted).toHaveLength(0);
	});
});

// ==================== I2. Desktop Reordering ====================

describe("desktop reordering", () => {
	function dragEvent(type: string, taskId: string, point?: { x: number; y: number }, relatedTarget?: Element | null): DragEvent {
		const event = new Event(type, { bubbles: true, cancelable: true }) as any;
		event.dataTransfer = {
			setData: jest.fn(),
			getData: jest.fn().mockReturnValue(taskId),
			effectAllowed: "",
			dropEffect: "",
		};
		if (point) {
			event.clientX = point.x;
			event.clientY = point.y;
		}
		event.relatedTarget = relatedTarget ?? null;
		return event as DragEvent;
	}

	/** Start dragging a task, hover a point in a quadrant, and optionally drop there */
	function drag(view: PriorityMatrixView, plugin: PriorityMatrixPlugin, title: string) {
		const task = plugin.data.tasks.find((t) => t.title === title)!;
		const taskEl = getTaskElByTitle(view, title);
		taskEl.dispatchEvent(dragEvent("dragstart", task.id));
		return {
			over(q: Quadrant, point: { x: number; y: number }) {
				getQuadrantByType(view, q).dispatchEvent(dragEvent("dragover", task.id, point));
				return this;
			},
			drop(q: Quadrant, point: { x: number; y: number }) {
				getQuadrantByType(view, q).dispatchEvent(dragEvent("drop", task.id, point));
				taskEl.dispatchEvent(dragEvent("dragend", task.id));
				return this;
			},
			end() {
				taskEl.dispatchEvent(dragEvent("dragend", task.id));
				return this;
			},
			taskEl,
		};
	}

	describe("dropping within the same quadrant", () => {
		it("moves the first task to the end when dropped below the last task", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 2));

			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["B", "C", "A"]);
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B", "C", "A"]);
		});

		it("moves the last task to the top when dropped above the first task", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B"]);
		});

		it("moves a task down into the middle of the list", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C", "D"] });

			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 2));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B", "C", "A", "D"]);
		});

		it("moves a task up into the middle of the list", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C", "D"] });

			drag(view, plugin, "D").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "D", "B", "C"]);
		});

		it("moves a task to the end when dropped in the empty space below the list", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "A").drop(Quadrant.Q1, bottomOf(Quadrant.Q1));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B", "C", "A"]);
		});

		it("moves a task to the top when dropped on the quadrant header", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").drop(Quadrant.Q1, { x: 100, y: 10 });

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B"]);
		});

		it("saves once after a reorder", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 2));

			expect(plugin.saveData).toHaveBeenCalledTimes(1);
			const saved = (plugin.saveData as jest.Mock).mock.calls[0][0];
			const savedOrder = saved.tasks
				.slice()
				.sort((a: any, b: any) => a.order - b.order)
				.map((t: any) => t.title);
			expect(savedOrder).toEqual(["B", "C", "A"]);
		});

		it("does not change other quadrants", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A", "B", "C"],
				[Quadrant.Q2]: ["X", "Y"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 2));

			expect(renderedTitles(view, Quadrant.Q2)).toEqual(["X", "Y"]);
		});

		it("keeps the task count badge unchanged", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 2));

			const badge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
			expect(badge!.textContent!.trim()).toBe("3");
		});

		it("keeps the new order across a later re-render", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			drag(view, plugin, "C").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			view.renderMatrix();

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B"]);
		});

		it("puts a task added after a reorder at the end", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			drag(view, plugin, "C").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			addTaskAndRender(view, plugin, "New", Quadrant.Q1);

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B", "New"]);
		});

		it("supports several reorders in a row", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C", "D"] });

			drag(view, plugin, "D").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0)); // D A B C
			mockLayout(view);
			drag(view, plugin, "A").drop(Quadrant.Q1, belowMiddleOf(Quadrant.Q1, 3)); // D B C A
			mockLayout(view);
			drag(view, plugin, "C").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1)); // D C B A

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["D", "C", "B", "A"]);
		});
	});

	describe("dropping a task where it already is", () => {
		const cases: [string, () => { x: number; y: number }][] = [
			["on itself", () => aboveMiddleOf(Quadrant.Q1, 1)],
			["on the lower half of the task above it", () => belowMiddleOf(Quadrant.Q1, 0)],
			["on the upper half of the task below it", () => aboveMiddleOf(Quadrant.Q1, 2)],
		];

		it.each(cases)("does not save or re-render when dropped %s", (_name, point) => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			const renderSpy = jest.spyOn(view, "renderMatrix");

			drag(view, plugin, "B").drop(Quadrant.Q1, point());

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderSpy).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B", "C"]);
		});

		it("does not save when the only task in a quadrant is dropped back", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["Solo"] });

			drag(view, plugin, "Solo").drop(Quadrant.Q1, bottomOf(Quadrant.Q1));

			expect(plugin.saveData).not.toHaveBeenCalled();
		});
	});

	describe("drop indicator", () => {
		it("is not shown before a drag starts", () => {
			const { view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			expect(getIndicators(view)).toHaveLength(0);
		});

		it("appears above the task the drop would land before", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1));

			expect(getIndicators(view)).toHaveLength(1);
			expect(indicatorIsAbove(view)).toBe("B");
		});

		it("appears at the end of the list when the drop would land last", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "A").over(Quadrant.Q1, bottomOf(Quadrant.Q1));

			expect(indicatorIsAbove(view)).toBeNull();
			const list = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-list")!;
			expect(list.lastElementChild!.classList.contains("pm-drop-indicator")).toBe(true);
		});

		it("appears at the top of the list when the drop would land first", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			const list = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-list")!;
			expect(list.firstElementChild!.classList.contains("pm-drop-indicator")).toBe(true);
		});

		it("lives inside the hovered quadrant's task list", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			const list = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-list");
			expect(getIndicators(view)[0].parentElement).toBe(list);
		});

		it("follows the pointer and never duplicates", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C", "D"] });
			const d = drag(view, plugin, "D");

			d.over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));
			expect(indicatorIsAbove(view)).toBe("A");
			d.over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1));
			expect(indicatorIsAbove(view)).toBe("B");
			d.over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 2));
			expect(indicatorIsAbove(view)).toBe("C");

			expect(getIndicators(view)).toHaveLength(1);
		});

		it.each([
			["over the dragged task itself", () => aboveMiddleOf(Quadrant.Q1, 1)],
			["over the lower half of the task above", () => belowMiddleOf(Quadrant.Q1, 0)],
			["over the upper half of the task below", () => aboveMiddleOf(Quadrant.Q1, 2)],
		])("is hidden when hovering %s, because nothing would move", (_name, point) => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "B").over(Quadrant.Q1, point());

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("disappears when the pointer returns to the task's own position", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			const d = drag(view, plugin, "B");
			d.over(Quadrant.Q1, bottomOf(Quadrant.Q1));
			expect(getIndicators(view)).toHaveLength(1);

			d.over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1));

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("is removed when the drag ends without a drop", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0)).end();

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("is removed after a drop that changes nothing", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			const d = drag(view, plugin, "B");
			d.over(Quadrant.Q1, bottomOf(Quadrant.Q1));

			d.drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 1));

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("is removed after a successful drop", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C")
				.over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0))
				.drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("is removed when the pointer leaves the quadrant", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			const task = plugin.data.tasks.find((t) => t.title === "C")!;
			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			const q1 = getQuadrantByType(view, Quadrant.Q1);
			q1.dispatchEvent(dragEvent("dragleave", task.id, undefined, document.body));

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("stays when the pointer only moves onto a child of the quadrant", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			const task = plugin.data.tasks.find((t) => t.title === "C")!;
			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			const q1 = getQuadrantByType(view, Quadrant.Q1);
			const child = q1.querySelector(".pm-quadrant-header")!;
			q1.dispatchEvent(dragEvent("dragleave", task.id, undefined, child));

			expect(getIndicators(view)).toHaveLength(1);
		});

		it("moves to the other quadrant when the pointer crosses over", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A", "B"],
				[Quadrant.Q2]: ["X", "Y"],
			});
			const d = drag(view, plugin, "A");
			d.over(Quadrant.Q1, bottomOf(Quadrant.Q1));

			d.over(Quadrant.Q2, aboveMiddleOf(Quadrant.Q2, 1));

			expect(getIndicators(view)).toHaveLength(1);
			const q2List = getQuadrantByType(view, Quadrant.Q2).querySelector(".pm-task-list");
			expect(getIndicators(view)[0].parentElement).toBe(q2List);
			expect(indicatorIsAbove(view)).toBe("Y");
		});

		it("is not shown over an empty quadrant, which is highlighted instead", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B"] });

			drag(view, plugin, "A").over(Quadrant.Q3, bottomOf(Quadrant.Q3));

			expect(getIndicators(view)).toHaveLength(0);
			expect(getQuadrantByType(view, Quadrant.Q3).classList.contains("pm-drop-target")).toBe(true);
		});

		it("is not shown for a drag that did not start on a task", () => {
			const { view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			getQuadrantByType(view, Quadrant.Q1).dispatchEvent(
				dragEvent("dragover", "", aboveMiddleOf(Quadrant.Q1, 0))
			);

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("does not count as a task", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });

			drag(view, plugin, "C").over(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0));

			expect(getTasksInQuadrant(view, Quadrant.Q1)).toHaveLength(3);
			expect(getIndicators(view)[0].classList.contains("pm-task")).toBe(false);
		});
	});

	describe("dropping into another quadrant", () => {
		it("inserts between two tasks at the drop position", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A", "B"],
				[Quadrant.Q2]: ["X", "Y", "Z"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q2, aboveMiddleOf(Quadrant.Q2, 1));

			expect(renderedTitles(view, Quadrant.Q2)).toEqual(["X", "A", "Y", "Z"]);
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B"]);
		});

		it("inserts first when dropped above the first task", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A"],
				[Quadrant.Q2]: ["X", "Y"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q2, aboveMiddleOf(Quadrant.Q2, 0));

			expect(renderedTitles(view, Quadrant.Q2)).toEqual(["A", "X", "Y"]);
		});

		it("appends when dropped below every task", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A"],
				[Quadrant.Q2]: ["X", "Y"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q2, bottomOf(Quadrant.Q2));

			expect(renderedTitles(view, Quadrant.Q2)).toEqual(["X", "Y", "A"]);
		});

		it("moves into an empty quadrant", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B"] });

			drag(view, plugin, "B").drop(Quadrant.Q4, bottomOf(Quadrant.Q4));

			expect(renderedTitles(view, Quadrant.Q4)).toEqual(["B"]);
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A"]);
		});

		it("saves once", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A"],
				[Quadrant.Q2]: ["X", "Y"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q2, aboveMiddleOf(Quadrant.Q2, 1));

			expect(plugin.saveData).toHaveBeenCalledTimes(1);
		});

		it("updates both task count badges", () => {
			const { plugin, view } = setupWithTasks({
				[Quadrant.Q1]: ["A", "B"],
				[Quadrant.Q2]: ["X"],
			});

			drag(view, plugin, "A").drop(Quadrant.Q2, aboveMiddleOf(Quadrant.Q2, 0));

			const count = (q: Quadrant) =>
				getQuadrantByType(view, q).querySelector(".pm-task-count")!.textContent!.trim();
			expect(count(Quadrant.Q1)).toBe("1");
			expect(count(Quadrant.Q2)).toBe("2");
		});
	});

	describe("interaction with other features", () => {
		it("ignores a drop whose task ID is unknown", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B"] });

			getQuadrantByType(view, Quadrant.Q1).dispatchEvent(
				dragEvent("drop", "not-a-task", bottomOf(Quadrant.Q1))
			);

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B"]);
		});

		it("positions around a task that is being edited", () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			(getTaskElByTitle(view, "B").querySelector(".pm-task-content") as HTMLElement).click();

			const task = plugin.data.tasks.find((t) => t.title === "A")!;
			const aEl = getTasksInQuadrant(view, Quadrant.Q1)[0];
			aEl.dispatchEvent(dragEvent("dragstart", task.id));
			getQuadrantByType(view, Quadrant.Q1).dispatchEvent(
				dragEvent("drop", task.id, bottomOf(Quadrant.Q1))
			);

			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["B", "C", "A"]);
		});

		it("restores a completed task without disturbing a reordered list", async () => {
			const { plugin, view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B", "C"] });
			drag(view, plugin, "C").drop(Quadrant.Q1, aboveMiddleOf(Quadrant.Q1, 0)); // C A B

			const b = plugin.data.tasks.find((t) => t.title === "B")!;
			plugin.completeTask(b.id);
			plugin.uncompleteTask(b.id);
			view.renderMatrix();

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B"]);
		});
	});
});

// ==================== I3. Touch Drag & Drop ====================

describe("touch drag and drop", () => {
	const LONG_PRESS_MS = 250;
	let frames: Map<number, FrameRequestCallback>;
	let nextFrameId: number;

	/** Run every animation frame callback that is currently queued */
	function runFrame(): void {
		const pending = Array.from(frames.values());
		frames.clear();
		pending.forEach((cb) => cb(0));
	}

	beforeEach(() => {
		jest.useFakeTimers();
		// Queue animation frames instead of running them inline, so the
		// auto-scroll loop can be stepped one frame at a time.
		frames = new Map();
		nextFrameId = 1;
		global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
			const id = nextFrameId++;
			frames.set(id, cb);
			return id;
		}) as any;
		global.cancelAnimationFrame = jest.fn((id: number) => {
			frames.delete(id);
		}) as any;
	});

	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = "";
		delete (navigator as any).vibrate;
	});

	function touchEvent(type: string, points: { x: number; y: number }[]): TouchEvent {
		const event = new Event(type, { bubbles: true, cancelable: true }) as any;
		const list = points.map((p) => ({ clientX: p.x, clientY: p.y }));
		// On touchend the lifted finger is only in changedTouches
		event.touches = type === "touchend" || type === "touchcancel" ? [] : list;
		event.changedTouches = list;
		return event as TouchEvent;
	}

	function getClone(): HTMLElement | null {
		return document.body.querySelector(".pm-touch-clone");
	}

	/** Seed, render, attach the view to the document, and apply the synthetic layout */
	function setupTouch(tasksByQuadrant: Partial<Record<Quadrant, string[]>>) {
		const result = setupWithTasks(tasksByQuadrant);
		document.body.appendChild(result.view.contentEl);
		return result;
	}

	/** Press a finger on a task and hold until the long-press fires */
	function longPress(view: PriorityMatrixView, title: string, q: Quadrant, index: number) {
		const taskEl = getTaskElByTitle(view, title);
		const start = { x: QUADRANT_ORIGIN[q].left + 100, y: taskTop(q, index) + TASK_HEIGHT / 2 };
		taskEl.dispatchEvent(touchEvent("touchstart", [start]));
		jest.advanceTimersByTime(LONG_PRESS_MS);
		return {
			taskEl,
			start,
			moveTo(point: { x: number; y: number }) {
				const event = touchEvent("touchmove", [point]);
				taskEl.dispatchEvent(event);
				return event;
			},
			release(point: { x: number; y: number }) {
				taskEl.dispatchEvent(touchEvent("touchend", [point]));
			},
			cancel() {
				taskEl.dispatchEvent(touchEvent("touchcancel", []));
			},
		};
	}

	describe("starting a drag", () => {
		it("starts after a long-press: shows a floating copy and dims the task", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });

			const press = longPress(view, "A", Quadrant.Q1, 0);

			expect(getClone()).not.toBeNull();
			expect(getClone()!.textContent).toContain("A");
			expect(press.taskEl.classList.contains("pm-dragging")).toBe(true);
		});

		it("does not start before the long-press delay has passed", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }]));
			jest.advanceTimersByTime(LONG_PRESS_MS - 1);

			expect(getClone()).toBeNull();
			expect(taskEl.classList.contains("pm-dragging")).toBe(false);
		});

		it("does not start for a quick tap", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }]));
			jest.advanceTimersByTime(100);
			taskEl.dispatchEvent(touchEvent("touchend", [bottomOf(Quadrant.Q1)]));
			jest.advanceTimersByTime(LONG_PRESS_MS);

			expect(getClone()).toBeNull();
			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["A", "B", "C"]);
			expect(plugin.saveData).not.toHaveBeenCalled();
		});

		it("does not start when the finger moves first, so the page can scroll", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }]));
			const scrollMove = touchEvent("touchmove", [{ x: 100, y: 95 }]);
			taskEl.dispatchEvent(scrollMove);
			jest.advanceTimersByTime(LONG_PRESS_MS);
			taskEl.dispatchEvent(touchEvent("touchend", [bottomOf(Quadrant.Q1)]));

			expect(scrollMove.defaultPrevented).toBe(false);
			expect(getClone()).toBeNull();
			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["A", "B", "C"]);
		});

		it("still starts when the finger only wobbles a few pixels", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }]));
			taskEl.dispatchEvent(touchEvent("touchmove", [{ x: 104, y: 75 }]));
			jest.advanceTimersByTime(LONG_PRESS_MS);

			expect(getClone()).not.toBeNull();
		});

		it("does not start for a two-finger touch", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }, { x: 150, y: 70 }]));
			jest.advanceTimersByTime(LONG_PRESS_MS);

			expect(getClone()).toBeNull();
		});

		it("vibrates when the drag starts on devices that support it", () => {
			const vibrate = jest.fn();
			(navigator as any).vibrate = vibrate;
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });

			longPress(view, "A", Quadrant.Q1, 0);

			expect(vibrate).toHaveBeenCalledTimes(1);
		});

		it("starts without error on devices that cannot vibrate (iOS)", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });
			expect((navigator as any).vibrate).toBeUndefined();

			expect(() => longPress(view, "A", Quadrant.Q1, 0)).not.toThrow();
			expect(getClone()).not.toBeNull();
		});

		it("does not start on a task that is being edited", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });
			const taskEl = getTaskElByTitle(view, "A");
			(taskEl.querySelector(".pm-task-content") as HTMLElement).click();
			const input = taskEl.querySelector(".pm-task-input") as HTMLElement;

			input.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 70 }]));
			jest.advanceTimersByTime(LONG_PRESS_MS);

			expect(getClone()).toBeNull();
		});
	});

	describe("while dragging", () => {
		it("blocks page scrolling", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);

			const move = press.moveTo(belowMiddleOf(Quadrant.Q1, 1));

			expect(move.defaultPrevented).toBe(true);
		});

		it("moves the floating copy with the finger", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			const before = { left: getClone()!.style.left, top: getClone()!.style.top };

			press.moveTo({ x: 180, y: 200 });

			expect(getClone()!.style.left).not.toBe(before.left);
			expect(getClone()!.style.top).not.toBe(before.top);
		});

		it("highlights the quadrant under the finger and only that one", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"], [Quadrant.Q2]: ["X"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo(bottomOf(Quadrant.Q1));
			press.moveTo(bottomOf(Quadrant.Q2));

			const highlighted = Array.from(view.contentEl.querySelectorAll(".pm-drop-target"));
			expect(highlighted).toHaveLength(1);
			expect(highlighted[0].getAttribute("data-quadrant")).toBe(Quadrant.Q2);
		});

		it("shows the drop indicator where the task would land", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo(belowMiddleOf(Quadrant.Q1, 1));

			expect(getIndicators(view)).toHaveLength(1);
			expect(indicatorIsAbove(view)).toBe("C");
		});

		it("moves the indicator as the finger moves", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo(belowMiddleOf(Quadrant.Q1, 1));
			expect(indicatorIsAbove(view)).toBe("C");
			press.moveTo(belowMiddleOf(Quadrant.Q1, 2));
			expect(indicatorIsAbove(view)).toBe("D");
			press.moveTo(bottomOf(Quadrant.Q1));
			expect(indicatorIsAbove(view)).toBeNull();

			expect(getIndicators(view)).toHaveLength(1);
		});

		it("hides the indicator over the task's own position", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "B", Quadrant.Q1, 1);
			press.moveTo(bottomOf(Quadrant.Q1));
			expect(getIndicators(view)).toHaveLength(1);

			press.moveTo(belowMiddleOf(Quadrant.Q1, 0));

			expect(getIndicators(view)).toHaveLength(0);
		});

		it("shows the indicator in another quadrant at the insertion point", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A"], [Quadrant.Q2]: ["X", "Y"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo(aboveMiddleOf(Quadrant.Q2, 1));

			const q2List = getQuadrantByType(view, Quadrant.Q2).querySelector(".pm-task-list");
			expect(getIndicators(view)[0].parentElement).toBe(q2List);
			expect(indicatorIsAbove(view)).toBe("Y");
		});

		it("hides the indicator and highlight when the finger is outside every quadrant", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			press.moveTo({ x: 290, y: 490 }); // the gap between the quadrants

			expect(getIndicators(view)).toHaveLength(0);
			expect(view.contentEl.querySelectorAll(".pm-drop-target")).toHaveLength(0);
		});
	});

	describe("dropping", () => {
		it("moves a task down within its quadrant", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			press.release(bottomOf(Quadrant.Q1));

			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["B", "C", "A"]);
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B", "C", "A"]);
		});

		it("moves a task up within its quadrant", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "C", Quadrant.Q1, 2);
			press.moveTo(aboveMiddleOf(Quadrant.Q1, 0));

			press.release(aboveMiddleOf(Quadrant.Q1, 0));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "A", "B"]);
			expect(storedTitles(plugin, Quadrant.Q1)).toEqual(["C", "A", "B"]);
		});

		it("moves a task into the middle of its quadrant", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D"] });
			const press = longPress(view, "D", Quadrant.Q1, 3);
			press.moveTo(aboveMiddleOf(Quadrant.Q1, 1));

			press.release(aboveMiddleOf(Quadrant.Q1, 1));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "D", "B", "C"]);
		});

		it("lands where the indicator was showing", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(belowMiddleOf(Quadrant.Q1, 2));
			const landsBefore = indicatorIsAbove(view);

			press.release(belowMiddleOf(Quadrant.Q1, 2));

			const titlesAfter = renderedTitles(view, Quadrant.Q1);
			expect(titlesAfter[titlesAfter.indexOf("A") + 1]).toBe(landsBefore);
		});

		it("saves once after a reorder", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			press.release(bottomOf(Quadrant.Q1));

			expect(plugin.saveData).toHaveBeenCalledTimes(1);
		});

		it("does not save when released at its own position", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "B", Quadrant.Q1, 1);
			press.moveTo(belowMiddleOf(Quadrant.Q1, 0));

			press.release(belowMiddleOf(Quadrant.Q1, 0));

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B", "C"]);
		});

		it("does not save when released without moving at all", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "B", Quadrant.Q1, 1);

			press.release(press.start);

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B", "C"]);
		});

		it("inserts at the drop position in another quadrant", () => {
			const { plugin, view } = setupTouch({
				[Quadrant.Q1]: ["A", "B"],
				[Quadrant.Q3]: ["X", "Y", "Z"],
			});
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(aboveMiddleOf(Quadrant.Q3, 2));

			press.release(aboveMiddleOf(Quadrant.Q3, 2));

			expect(renderedTitles(view, Quadrant.Q3)).toEqual(["X", "Y", "A", "Z"]);
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["B"]);
			expect(plugin.saveData).toHaveBeenCalledTimes(1);
		});

		it("moves into an empty quadrant", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q4));

			press.release(bottomOf(Quadrant.Q4));

			expect(renderedTitles(view, Quadrant.Q4)).toEqual(["A"]);
		});

		it("changes nothing when released outside every quadrant", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo({ x: 290, y: 490 });

			press.release({ x: 290, y: 490 });

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B", "C"]);
		});

		it("removes the floating copy, indicator and highlight afterwards", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			press.release(bottomOf(Quadrant.Q1));

			expect(getClone()).toBeNull();
			expect(getIndicators(view)).toHaveLength(0);
			expect(view.contentEl.querySelectorAll(".pm-drop-target")).toHaveLength(0);
			expect(view.contentEl.querySelectorAll(".pm-dragging")).toHaveLength(0);
		});

		it("allows a second drag straight after the first", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const first = longPress(view, "A", Quadrant.Q1, 0);
			first.moveTo(bottomOf(Quadrant.Q1));
			first.release(bottomOf(Quadrant.Q1)); // B C A
			mockLayout(view);

			const second = longPress(view, "C", Quadrant.Q1, 1);
			second.moveTo(aboveMiddleOf(Quadrant.Q1, 0));
			second.release(aboveMiddleOf(Quadrant.Q1, 0));

			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["C", "B", "A"]);
		});
	});

	describe("popout windows", () => {
		it("adds the floating copy to the window the task is in, not the main window", () => {
			const { view } = setupWithTasks({ [Quadrant.Q1]: ["A", "B"] });
			// A popout window has its own document; move the view into one
			const popout = document.implementation.createHTMLDocument("popout");
			popout.body.appendChild(popout.adoptNode(view.contentEl));

			longPress(view, "A", Quadrant.Q1, 0);

			expect(popout.body.querySelector(".pm-touch-clone")).not.toBeNull();
			expect(document.body.querySelector(".pm-touch-clone")).toBeNull();
		});
	});

	describe("cancelling", () => {
		it("changes nothing and cleans up when the system cancels the touch", () => {
			const { plugin, view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			press.cancel();

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(renderedTitles(view, Quadrant.Q1)).toEqual(["A", "B", "C"]);
			expect(getClone()).toBeNull();
			expect(getIndicators(view)).toHaveLength(0);
			expect(view.contentEl.querySelectorAll(".pm-drop-target")).toHaveLength(0);
			expect(press.taskEl.classList.contains("pm-dragging")).toBe(false);
		});

		it("cleans up when the view closes mid-drag", async () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C"] });
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo(bottomOf(Quadrant.Q1));

			await view.onClose();

			expect(getClone()).toBeNull();
			expect(getIndicators(view)).toHaveLength(0);
		});
	});

	describe("auto-scroll near the edges", () => {
		/** Make an element behave like a scroll container of the given visible box */
		function makeScrollable(el: HTMLElement, box: { top: number; height: number }, contentHeight: number, overflowY = "auto") {
			el.style.overflowY = overflowY;
			Object.defineProperty(el, "scrollHeight", { configurable: true, value: contentHeight });
			Object.defineProperty(el, "clientHeight", { configurable: true, value: box.height });
			el.getBoundingClientRect = () => makeRect(0, box.top, 600, box.height);
		}

		/** A phone-like setup: the whole view is the one scroll container, 600px tall */
		function setupPhone() {
			const result = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D", "E", "F"] });
			makeScrollable(result.view.contentEl, { top: 0, height: 600 }, 2000);
			result.view.contentEl.scrollTop = 300;
			return result;
		}

		it("scrolls down while the finger is held near the bottom edge", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo({ x: 100, y: 590 });
			runFrame();

			expect(view.contentEl.scrollTop).toBeGreaterThan(300);
		});

		it("scrolls up while the finger is held near the top edge", () => {
			const { view } = setupPhone();
			const press = longPress(view, "C", Quadrant.Q1, 2);

			press.moveTo({ x: 100, y: 10 });
			runFrame();

			expect(view.contentEl.scrollTop).toBeLessThan(300);
		});

		it("keeps scrolling frame after frame while the finger stays put", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo({ x: 100, y: 590 });

			runFrame();
			const afterOne = view.contentEl.scrollTop;
			runFrame();
			runFrame();

			expect(view.contentEl.scrollTop).toBeGreaterThan(afterOne);
		});

		it("does not scroll while the finger is in the middle of the view", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo({ x: 100, y: 300 });
			runFrame();
			runFrame();

			expect(view.contentEl.scrollTop).toBe(300);
		});

		it("scrolls faster the closer the finger is to the edge", () => {
			const near = setupPhone();
			const nearPress = longPress(near.view, "A", Quadrant.Q1, 0);
			nearPress.moveTo({ x: 100, y: 598 });
			runFrame();
			const fast = near.view.contentEl.scrollTop - 300;
			nearPress.cancel();
			document.body.innerHTML = "";

			const far = setupPhone();
			const farPress = longPress(far.view, "A", Quadrant.Q1, 0);
			farPress.moveTo({ x: 100, y: 560 });
			runFrame();
			const slow = far.view.contentEl.scrollTop - 300;

			expect(slow).toBeGreaterThan(0);
			expect(fast).toBeGreaterThan(slow);
		});

		it("stops when the finger moves away from the edge", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo({ x: 100, y: 590 });
			runFrame();

			press.moveTo({ x: 100, y: 300 });
			const settled = view.contentEl.scrollTop;
			runFrame();
			runFrame();

			expect(view.contentEl.scrollTop).toBe(settled);
		});

		it("stops when the finger is lifted", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo({ x: 100, y: 590 });
			runFrame();

			press.release({ x: 100, y: 590 });
			const settled = view.contentEl.scrollTop;
			runFrame();
			runFrame();

			expect(view.contentEl.scrollTop).toBe(settled);
		});

		it("stops when the touch is cancelled", () => {
			const { view } = setupPhone();
			const press = longPress(view, "A", Quadrant.Q1, 0);
			press.moveTo({ x: 100, y: 590 });
			runFrame();

			press.cancel();
			const settled = view.contentEl.scrollTop;
			runFrame();

			expect(view.contentEl.scrollTop).toBe(settled);
		});

		it("does not scroll before a drag has started", () => {
			const { view } = setupPhone();
			const taskEl = getTaskElByTitle(view, "A");

			taskEl.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 590 }]));
			taskEl.dispatchEvent(touchEvent("touchmove", [{ x: 100, y: 595 }]));
			runFrame();

			expect(view.contentEl.scrollTop).toBe(300);
		});

		it("does not scroll a view that has nothing to scroll", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });
			makeScrollable(view.contentEl, { top: 0, height: 600 }, 600);
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo({ x: 100, y: 590 });
			runFrame();

			expect(view.contentEl.scrollTop).toBe(0);
		});

		it("does not scroll a container whose overflow is hidden (desktop layout)", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B"] });
			makeScrollable(view.contentEl, { top: 0, height: 600 }, 2000, "hidden");
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo({ x: 100, y: 590 });
			runFrame();

			expect(view.contentEl.scrollTop).toBe(0);
		});

		it("scrolls the hovered quadrant's own list when that is what overflows (tablet layout)", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] });
			makeScrollable(view.contentEl, { top: 0, height: 1000 }, 1000, "hidden");
			const list = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-list") as HTMLElement;
			makeScrollable(list, { top: 50, height: 430 }, 900);
			const press = longPress(view, "A", Quadrant.Q1, 0);

			press.moveTo({ x: 100, y: 470 }); // 10px above the list's bottom edge
			runFrame();

			expect(list.scrollTop).toBeGreaterThan(0);
			expect(view.contentEl.scrollTop).toBe(0);
		});

		it("re-evaluates the drop position after scrolling moves the list under the finger", () => {
			const { view } = setupTouch({ [Quadrant.Q1]: ["A", "B", "C", "D", "E", "F"] });
			makeScrollable(view.contentEl, { top: 0, height: 480 }, 2000);
			const press = longPress(view, "C", Quadrant.Q1, 2);
			press.moveTo({ x: 100, y: 470 }); // below every task, near the bottom edge
			expect(indicatorIsAbove(view)).toBeNull();

			// Simulate the list having scrolled: every task is now below the finger
			getTasksInQuadrant(view, Quadrant.Q1).forEach((el, i) => {
				el.getBoundingClientRect = () => makeRect(10, 700 + i * TASK_PITCH, 260, TASK_HEIGHT);
			});
			runFrame();

			expect(indicatorIsAbove(view)).toBe("A");
		});
	});
});

// ==================== J. Data Persistence ====================

describe("data persistence", () => {
	it("savePluginData called on task add", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "Persist me";
		submitBtn.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});

	it("savePluginData called on task edit", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Edit me", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		const saveBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-submit") as HTMLElement;
		input.value = "Edited";
		saveBtn.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});

	it("savePluginData called on task delete", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Delete me", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});

	it("savePluginData called on undo", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Undo me", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		// Clear call count from delete
		(plugin.saveData as jest.Mock).mockClear();

		const fragment = Notice.instances[0].message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link") as HTMLElement;
		undoLink.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});

	it("savePluginData called on drag move", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Move me", Quadrant.Q1, null);
		view.renderMatrix();

		const q2El = getQuadrantByType(view, Quadrant.Q2);
		const event = new Event("drop", { bubbles: true, cancelable: true }) as any;
		event.dataTransfer = {
			getData: jest.fn().mockReturnValue(task.id),
		};
		event.preventDefault = jest.fn();
		q2El.dispatchEvent(event);
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});
});

// ==================== K. Edge Cases & Validation ====================

describe("edge cases", () => {
	it("whitespace-only title is rejected", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "   ";
		submitBtn.click();

		expect(plugin.data.tasks).toHaveLength(0);
		expect(input.classList.contains("pm-input-error")).toBe(true);
	});

	it("single character title is accepted", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "X";
		submitBtn.click();
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(1);
		expect(plugin.data.tasks[0].title).toBe("X");
	});

	it("special characters in title render safely", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, '<script>alert("xss")</script>', Quadrant.Q1);

		const title = view.contentEl.querySelector(".pm-task-title");
		expect(title!.textContent).toBe('<script>alert("xss")</script>');
		// Should be text content, not parsed HTML
		expect(view.contentEl.querySelector("script")).toBeNull();
	});

	it("empty date field stores null", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q1);
		const input = getFormInput(form);
		const dateInput = getFormDateInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "No date task";
		dateInput.value = "";
		submitBtn.click();
		await flushPromises();

		expect(plugin.data.tasks[0].dueDate).toBeNull();
	});

	it("rapid add operations maintain correct state", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		// Rapidly add 5 tasks
		for (let i = 0; i < 5; i++) {
			const form = getAddForm(view, Quadrant.Q1);
			const input = getFormInput(form);
			const submitBtn = getFormSubmitBtn(form);

			input.value = `Task ${i}`;
			submitBtn.click();
			await flushPromises();
		}

		expect(plugin.data.tasks).toHaveLength(5);
		const titles = plugin.data.tasks.map((t) => t.title);
		expect(titles).toEqual(["Task 0", "Task 1", "Task 2", "Task 3", "Task 4"]);
	});

	it("whitespace-only title rejected in edit form", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Original", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const input = view.contentEl.querySelector(".pm-edit-form .pm-task-input") as HTMLInputElement;
		const saveBtn = view.contentEl.querySelector(".pm-edit-form .pm-form-submit") as HTMLElement;

		input.value = "   ";
		saveBtn.click();

		expect(plugin.data.tasks[0].title).toBe("Original");
		expect(input.classList.contains("pm-input-error")).toBe(true);
	});
});

// ==================== L. Accessibility ====================

describe("accessibility", () => {
	it("add buttons have descriptive aria-labels", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const buttons = view.contentEl.querySelectorAll(".pm-add-btn");
		expect(buttons).toHaveLength(4);

		const labels = Array.from(buttons).map((b) => b.getAttribute("aria-label"));
		expect(labels).toContain("Add task to Do");
		expect(labels).toContain("Add task to Schedule");
		expect(labels).toContain("Add task to Delegate");
		expect(labels).toContain("Add task to Eliminate");
	});

	it("delete buttons have aria-label", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const deleteBtn = view.contentEl.querySelector(".pm-task-delete");
		expect(deleteBtn!.getAttribute("aria-label")).toBe("Delete task");
	});

	it("tasks have data-task-id for programmatic access", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Accessible", Quadrant.Q1, null);
		view.renderMatrix();

		const taskEl = view.contentEl.querySelector(`[data-task-id="${task.id}"]`);
		expect(taskEl).toBeTruthy();
	});
});

// ==================== M. Event Propagation ====================

describe("event propagation", () => {
	it("delete button click does not trigger task edit", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		// The delete handler calls stopPropagation, so clicking delete
		// should not also open the edit form
		const deleteBtn = view.contentEl.querySelector(".pm-task-delete") as HTMLElement;
		deleteBtn.click();

		// If edit was triggered, there would be an edit form
		// (before delete removes and re-renders everything)
		// Since delete has stopPropagation, no edit form should appear
		const editForm = view.contentEl.querySelector(".pm-edit-form");
		expect(editForm).toBeNull();
	});

	it("edit form mousedown stops propagation", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const content = view.contentEl.querySelector(".pm-task-content") as HTMLElement;
		content.click();

		const editForm = view.contentEl.querySelector(".pm-edit-form") as HTMLElement;
		const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		const stopSpy = jest.spyOn(event, "stopPropagation");

		editForm.dispatchEvent(event);
		expect(stopSpy).toHaveBeenCalled();
	});
});

// ==================== N. Add Form per Quadrant ====================

describe("add form per quadrant", () => {
	it("each quadrant has its own independent add form", () => {
		const view = createView(createPlugin());
		view.renderMatrix();

		const forms = view.contentEl.querySelectorAll(".pm-add-form");
		expect(forms).toHaveLength(4);
	});

	it("adding to one quadrant does not affect others", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		view.renderMatrix();

		const form = getAddForm(view, Quadrant.Q3);
		const input = getFormInput(form);
		const submitBtn = getFormSubmitBtn(form);

		input.value = "Q3 task";
		submitBtn.click();
		await flushPromises();

		expect(getTasksInQuadrant(view, Quadrant.Q1)).toHaveLength(0);
		expect(getTasksInQuadrant(view, Quadrant.Q2)).toHaveLength(0);
		expect(getTasksInQuadrant(view, Quadrant.Q3)).toHaveLength(1);
		expect(getTasksInQuadrant(view, Quadrant.Q4)).toHaveLength(0);
	});
});

// ==================== O. Task Checkbox Rendering ====================

describe("task checkbox rendering", () => {
	it("each task has a checkbox element", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox");
		expect(checkbox).toBeTruthy();
	});

	it("checkbox is before task content in DOM order", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const taskEl = view.contentEl.querySelector(".pm-task") as HTMLElement;
		const children = Array.from(taskEl.children).map((c) => c.className.split(" ")[0]);
		const checkboxIdx = children.indexOf("pm-task-checkbox");
		const contentIdx = children.indexOf("pm-task-content");
		expect(checkboxIdx).toBeLessThan(contentIdx);
		expect(checkboxIdx).toBeGreaterThanOrEqual(0);
	});

	it("checkbox does not have pm-checked class for active tasks", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Active", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox");
		expect(checkbox!.classList.contains("pm-checked")).toBe(false);
	});
});

// ==================== P. Completing a Task ====================

describe("completing a task", () => {
	it("clicking checkbox completes the task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Check me off", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(plugin.data.tasks[0].completedAt).toBeTruthy();
	});

	it("completed task disappears from quadrant", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Gone soon", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(getTasksInQuadrant(view, Quadrant.Q1)).toHaveLength(0);
	});

	it("completed task appears in completed section", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Done task", Quadrant.Q2);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		const section = view.contentEl.querySelector(".pm-completed-section");
		expect(section).toBeTruthy();
		const title = section!.querySelector(".pm-completed-task-title");
		expect(title!.textContent).toBe("Done task");
	});

	it("saves data after completion", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Task", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});

	it("shows notice with undo on completion", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Notice test", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(Notice.instances).toHaveLength(1);
		const notice = Notice.instances[0];
		expect(notice.duration).toBe(5000);
		const fragment = notice.message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link");
		expect(undoLink).toBeTruthy();
		expect(undoLink!.textContent).toBe("Undo");
	});

	it("undo on completion notice restores the task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Undo complete", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();
		expect(plugin.data.tasks[0].completedAt).toBeTruthy();

		const fragment = Notice.instances[0].message as DocumentFragment;
		const undoLink = fragment.querySelector(".pm-undo-link") as HTMLElement;
		undoLink.click();
		await flushPromises();

		expect(plugin.data.tasks[0].completedAt).toBeNull();
		expect(getTasksInQuadrant(view, Quadrant.Q1)).toHaveLength(1);
	});

	it("auto-expands completed section on first completion", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "First complete", Quadrant.Q1);

		const checkbox = view.contentEl.querySelector(".pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		const list = view.contentEl.querySelector(".pm-completed-list");
		expect(list!.classList.contains("pm-hidden")).toBe(false);
	});

	it("quadrant task count decreases after completion", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		plugin.addTask("Keep", Quadrant.Q1, null);
		plugin.addTask("Complete", Quadrant.Q1, null);
		view.renderMatrix();

		const badge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
		expect(badge!.textContent!.trim()).toBe("2");

		const checkboxes = view.contentEl.querySelectorAll(".pm-task-checkbox");
		(checkboxes[1] as HTMLElement).click();
		await flushPromises();

		const newBadge = getQuadrantByType(view, Quadrant.Q1).querySelector(".pm-task-count");
		expect(newBadge!.textContent!.trim()).toBe("1");
	});
});

// ==================== Q. Completed Section Rendering ====================

describe("completed section rendering", () => {
	it("section is not rendered when no completed tasks", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		addTaskAndRender(view, plugin, "Active", Quadrant.Q1);

		expect(view.contentEl.querySelector(".pm-completed-section")).toBeNull();
	});

	it("section renders below the matrix wrapper", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Done", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const section = view.contentEl.querySelector(".pm-completed-section");
		const wrapper = view.contentEl.querySelector(".pm-matrix-wrapper");
		expect(section).toBeTruthy();
		// Section should come after wrapper in DOM
		const children = Array.from(view.contentEl.children);
		expect(children.indexOf(section as Element)).toBeGreaterThan(children.indexOf(wrapper as Element));
	});

	it("header shows correct completed count", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const t1 = plugin.addTask("Done 1", Quadrant.Q1, null);
		const t2 = plugin.addTask("Done 2", Quadrant.Q2, null);
		plugin.completeTask(t1.id);
		plugin.completeTask(t2.id);
		view.renderMatrix();

		const header = view.contentEl.querySelector(".pm-completed-header");
		expect(header!.textContent).toContain("2");
	});

	it("list is collapsed by default", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Done", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const list = view.contentEl.querySelector(".pm-completed-list");
		expect(list!.classList.contains("pm-hidden")).toBe(true);
	});

	it("clicking header toggles collapsed state", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Done", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const header = view.contentEl.querySelector(".pm-completed-header") as HTMLElement;
		const list = view.contentEl.querySelector(".pm-completed-list") as HTMLElement;

		header.click();
		expect(list.classList.contains("pm-hidden")).toBe(false);

		header.click();
		expect(list.classList.contains("pm-hidden")).toBe(true);
	});

	it("completed task shows strikethrough title", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Struck", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const title = view.contentEl.querySelector(".pm-completed-task-title");
		expect(title).toBeTruthy();
		expect(title!.textContent).toBe("Struck");
	});

	it("completed task shows quadrant color dot", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Q1 done", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const dot = view.contentEl.querySelector(".pm-quadrant-dot") as HTMLElement;
		expect(dot).toBeTruthy();
		// jsdom normalizes hex to rgb, so check it contains the color value
		expect(dot.style.background).toBeTruthy();
	});

	it("completed task shows completion time", () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-01-01T12:00:00Z"));

		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Timed", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const time = view.contentEl.querySelector(".pm-completed-task-time");
		expect(time).toBeTruthy();
		expect(time!.textContent).toBe("Just now");

		jest.useRealTimers();
	});

	it("completed task has a checked checkbox", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Done", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const checkbox = view.contentEl.querySelector(".pm-completed-task .pm-task-checkbox");
		expect(checkbox!.classList.contains("pm-checked")).toBe(true);
	});

	it("completed task has a delete button", () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Delete me", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const deleteBtn = view.contentEl.querySelector(".pm-completed-task .pm-task-delete");
		expect(deleteBtn).toBeTruthy();
	});
});

// ==================== R. Uncompleting (Reviving) a Task ====================

describe("uncompleting a task", () => {
	it("clicking checked checkbox revives the task", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Revive me", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const checkbox = view.contentEl.querySelector(".pm-completed-task .pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(plugin.data.tasks[0].completedAt).toBeNull();
	});

	it("revived task reappears in its original quadrant", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Come back", Quadrant.Q3, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const checkbox = view.contentEl.querySelector(".pm-completed-task .pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(getTasksInQuadrant(view, Quadrant.Q3)).toHaveLength(1);
		const title = getQuadrantByType(view, Quadrant.Q3).querySelector(".pm-task-title");
		expect(title!.textContent).toBe("Come back");
	});

	it("completed section disappears when last task revived", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Only one", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const checkbox = view.contentEl.querySelector(".pm-completed-task .pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(view.contentEl.querySelector(".pm-completed-section")).toBeNull();
	});

	it("saves data after uncomplete", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Task", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();
		(plugin.saveData as jest.Mock).mockClear();

		const checkbox = view.contentEl.querySelector(".pm-completed-task .pm-task-checkbox") as HTMLElement;
		checkbox.click();
		await flushPromises();

		expect(plugin.saveData).toHaveBeenCalled();
	});
});

// ==================== S. Delete from Completed ====================

describe("delete from completed", () => {
	it("clicking delete in completed section removes the task permanently", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Bye forever", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();

		const deleteBtn = view.contentEl.querySelector(".pm-completed-task .pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		expect(plugin.data.tasks).toHaveLength(0);
	});

	it("delete from completed shows undo notice", async () => {
		const plugin = createPlugin();
		const view = createView(plugin);
		const task = plugin.addTask("Undo me", Quadrant.Q1, null);
		plugin.completeTask(task.id);
		view.renderMatrix();
		Notice.clear();

		const deleteBtn = view.contentEl.querySelector(".pm-completed-task .pm-task-delete") as HTMLElement;
		deleteBtn.click();
		await flushPromises();

		expect(Notice.instances).toHaveLength(1);
	});
});
