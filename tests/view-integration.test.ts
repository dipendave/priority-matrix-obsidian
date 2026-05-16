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
		expect(view.getDisplayText()).toBe("Priority matrix");
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
		expect(Notice.instances[0].message).toBe("Long-press a task to drag it between quadrants");
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
