import { ItemView, WorkspaceLeaf, setIcon, Notice, Platform } from "obsidian";
import {
	VIEW_TYPE_PRIORITY,
	Quadrant,
	QUADRANT_META,
	QUADRANT_COLORS,
	QuadrantMeta,
	Task,
} from "./types";
import PriorityMatrixPlugin from "./main";

/** How long a finger must rest on a task before a touch drag starts. */
const LONG_PRESS_MS = 250;
/** Finger travel that turns a press into a scroll instead of a drag. */
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/** A touch drag this close to the top or bottom of a scroll area scrolls it. */
const AUTO_SCROLL_EDGE_PX = 60;
/** Scroll speed per animation frame when the finger is right at the edge. */
const AUTO_SCROLL_MAX_SPEED_PX = 14;

export class PriorityMatrixView extends ItemView {
	plugin: PriorityMatrixPlugin;

	private draggedTaskId: string | null = null;
	private touchClone: HTMLElement | null = null;
	private touchTimeout: number | null = null;
	private draggedEl: HTMLElement | null = null;
	private dropIndicator: HTMLElement | null = null;
	private lastTouchPoint: { x: number; y: number } | null = null;
	private autoScrollFrame: number | null = null;
	private completedSectionExpanded = false;

	constructor(leaf: WorkspaceLeaf, plugin: PriorityMatrixPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PRIORITY;
	}

	getDisplayText(): string {
		return "Task priority matrix";
	}

	getIcon(): string {
		return "layout-grid";
	}

	onOpen(): Promise<void> {
		this.renderMatrix();
		if (Platform.isMobile && !this.plugin.data.hasSeenDragHint) {
			new Notice("Long-press a task to reorder it or drag it between quadrants", 5000);
			this.plugin.data.hasSeenDragHint = true;
			void this.plugin.savePluginData();
		}
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.cleanupTouchDrag();
		return Promise.resolve();
	}

	// ==================== RENDERING ====================

	renderMatrix(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("pm-container");
		// The indicator lived inside the DOM that was just thrown away
		this.dropIndicator = null;

		const matrixWrapper = container.createDiv({ cls: "pm-matrix-wrapper" });

		// Urgency axis label
		const urgencyLabel = matrixWrapper.createDiv({ cls: "pm-axis-label pm-axis-urgency" });
		urgencyLabel.createSpan({ text: "URGENT", cls: "pm-axis-left" });
		urgencyLabel.createSpan({ text: "NOT URGENT", cls: "pm-axis-right" });

		// Importance axis label (vertical)
		const importanceLabel = matrixWrapper.createDiv({ cls: "pm-axis-label pm-axis-importance" });
		importanceLabel.createSpan({ text: "NOT IMPORTANT", cls: "pm-axis-bottom" });
		importanceLabel.createSpan({ text: "IMPORTANT", cls: "pm-axis-top" });

		// Grid
		const grid = matrixWrapper.createDiv({ cls: "pm-grid" });

		// Render quadrants: Q1 (top-left), Q2 (top-right), Q3 (bottom-left), Q4 (bottom-right)
		const quadrantOrder = [Quadrant.Q1, Quadrant.Q2, Quadrant.Q3, Quadrant.Q4];
		for (const q of quadrantOrder) {
			this.renderQuadrant(grid, QUADRANT_META[q]);
		}

		// Completed section
		const completedTasks = this.plugin.getCompletedTasks();
		if (completedTasks.length > 0) {
			this.renderCompletedSection(container, completedTasks);
		}

		window.requestAnimationFrame(() => this.updateOverflowIndicators());
	}

	private updateOverflowIndicators(): void {
		this.contentEl.querySelectorAll(".pm-task-list").forEach((el) => {
			const list = el as HTMLElement;
			list.toggleClass("pm-has-overflow", list.scrollHeight > list.clientHeight);
		});
	}

	private renderQuadrant(gridEl: HTMLElement, meta: QuadrantMeta): void {
		const quadrantEl = gridEl.createDiv({
			cls: `pm-quadrant ${meta.colorClass}`,
			attr: { "data-quadrant": meta.id },
		});

		const tasks = this.plugin.getTasksForQuadrant(meta.id);

		// Header
		const headerEl = quadrantEl.createDiv({ cls: "pm-quadrant-header" });
		const titleGroup = headerEl.createDiv({ cls: "pm-quadrant-title-group" });
		const h3 = titleGroup.createEl("h3", { text: meta.action, cls: "pm-quadrant-action" });
		if (tasks.length > 0) {
			h3.createSpan({ text: ` ${tasks.length}`, cls: "pm-task-count" });
		}

		const addBtn = headerEl.createEl("button", {
			cls: "pm-add-btn",
			attr: { "aria-label": `Add task to ${meta.action}` },
		});
		setIcon(addBtn, "plus");

		// Task list
		const listEl = quadrantEl.createDiv({ cls: "pm-task-list" });
		if (tasks.length === 0) {
			quadrantEl.addClass("pm-quadrant-empty");
			this.renderEmptyState(listEl);
		} else {
			for (const task of tasks) {
				this.renderTask(listEl, task);
			}
		}

		// Add form (hidden by default)
		const formEl = quadrantEl.createDiv({ cls: "pm-add-form pm-hidden" });
		this.renderAddTaskForm(formEl, meta.id);

		addBtn.addEventListener("click", () => {
			const isHidden = formEl.hasClass("pm-hidden");
			formEl.toggleClass("pm-hidden", !isHidden);
			if (isHidden) {
				const input = formEl.querySelector(".pm-task-input") as HTMLInputElement;
				input?.focus();
				// Scroll form into view after keyboard opens
				window.setTimeout(() => {
					formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
				}, 300);
			}
		});

		// Drop zone
		this.setupQuadrantDropZone(quadrantEl, meta.id);
	}

	private renderTask(listEl: HTMLElement, task: Task): void {
		const taskEl = listEl.createDiv({
			cls: "pm-task",
			attr: {
				"data-task-id": task.id,
				draggable: "true",
			},
		});

		// Drag handle
		const dragHandle = taskEl.createDiv({ cls: "pm-task-drag-handle" });
		dragHandle.textContent = "\u2630";

		// Completion checkbox
		const checkbox = taskEl.createDiv({ cls: "pm-task-checkbox" });
		checkbox.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.handleCompleteTask(task.id);
		});

		// Content
		const contentEl = taskEl.createDiv({ cls: "pm-task-content" });
		contentEl.createDiv({ cls: "pm-task-title", text: task.title });

		if (task.dueDate) {
			const dueDateEl = contentEl.createDiv({ cls: "pm-task-due" });
			if (isDueDatePast(task.dueDate)) {
				dueDateEl.addClass("pm-overdue");
			}
			dueDateEl.setText(formatDueDate(task.dueDate));
		}

		// Click to edit
		contentEl.addEventListener("click", (e) => {
			e.stopPropagation();
			this.renderEditForm(taskEl, task);
		});

		// Delete button
		const deleteBtn = taskEl.createEl("button", {
			cls: "pm-task-delete",
			attr: { "aria-label": "Delete task" },
		});
		deleteBtn.textContent = "\u00d7";

		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.handleDeleteTask(task.id);
		});

		// Drag setup
		this.setupDesktopDrag(taskEl, task.id);
		this.setupTouchDrag(taskEl, task.id);
	}

	private renderAddTaskForm(formEl: HTMLElement, quadrant: Quadrant): void {
		const inputEl = formEl.createEl("input", {
			cls: "pm-task-input",
			attr: {
				type: "text",
				placeholder: "Task title...",
			},
		});

		const dateRow = formEl.createDiv({ cls: "pm-form-date-row" });
		dateRow.createEl("label", { text: "Due:", cls: "pm-date-label" });
		const dateInput = dateRow.createEl("input", {
			cls: "pm-date-input",
			attr: { type: "date" },
		});

		const btnRow = formEl.createDiv({ cls: "pm-form-btn-row" });
		const submitBtn = btnRow.createEl("button", {
			text: "Add",
			cls: "pm-form-submit",
		});
		const cancelBtn = btnRow.createEl("button", {
			text: "Cancel",
			cls: "pm-form-cancel",
		});

		const submit = () => {
			const title = inputEl.value.trim();
			if (!title) {
				inputEl.addClass("pm-input-error");
				return;
			}
			const dueDate = dateInput.value || null;
			void this.handleAddTask(quadrant, title, dueDate);
			inputEl.value = "";
			dateInput.value = "";
			inputEl.removeClass("pm-input-error");
			formEl.addClass("pm-hidden");
		};

		submitBtn.addEventListener("click", submit);

		inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				submit();
			} else if (e.key === "Escape") {
				formEl.addClass("pm-hidden");
			}
		});

		inputEl.addEventListener("input", () => {
			inputEl.removeClass("pm-input-error");
		});

		// Scroll form into view when keyboard opens on mobile
		inputEl.addEventListener("focus", () => {
			window.setTimeout(() => {
				formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}, 300);
		});

		cancelBtn.addEventListener("click", () => {
			inputEl.value = "";
			dateInput.value = "";
			inputEl.removeClass("pm-input-error");
			formEl.addClass("pm-hidden");
		});
	}

	private renderEmptyState(listEl: HTMLElement): void {
		listEl.createDiv({ cls: "pm-empty-state", text: "Tap + to add, tap a task to edit" });
	}

	// ==================== TASK ACTIONS ====================

	private async handleAddTask(quadrant: Quadrant, title: string, dueDate: string | null): Promise<void> {
		const newTask = this.plugin.addTask(title, quadrant, dueDate);
		await this.plugin.savePluginData();
		this.renderMatrix();
		const newTaskEl = this.contentEl.querySelector(`[data-task-id="${newTask.id}"]`);
		if (newTaskEl) {
			(newTaskEl as HTMLElement).addClass("pm-task-new");
		}
	}

	private async handleDeleteTask(taskId: string): Promise<void> {
		const savedTask = this.plugin.data.tasks.find((t) => t.id === taskId);
		if (!savedTask) return;
		const taskCopy = { ...savedTask };

		this.plugin.deleteTask(taskId);
		await this.plugin.savePluginData();
		this.renderMatrix();

		const fragment = createFragment();
		fragment.appendText("Task deleted. ");
		const undoLink = fragment.createEl("a", { text: "Undo", cls: "pm-undo-link" });

		const notice = new Notice(fragment, 5000);

		undoLink.addEventListener("click", () => {
			this.plugin.restoreTask(taskCopy);
			void this.plugin.savePluginData();
			this.renderMatrix();
			notice.hide();
		});
	}

	private async handleCompleteTask(taskId: string): Promise<void> {
		const savedTask = this.plugin.data.tasks.find((t) => t.id === taskId);
		if (!savedTask) return;
		const taskCopy = { ...savedTask };

		// Auto-expand completed section when first task is completed
		const hadCompletedBefore = this.plugin.getCompletedTasks().length > 0;
		this.plugin.completeTask(taskId);
		if (!hadCompletedBefore) {
			this.completedSectionExpanded = true;
		}
		await this.plugin.savePluginData();
		this.renderMatrix();

		const fragment = createFragment();
		fragment.appendText("Task completed. ");
		const undoLink = fragment.createEl("a", { text: "Undo", cls: "pm-undo-link" });

		const notice = new Notice(fragment, 5000);

		undoLink.addEventListener("click", () => {
			this.plugin.uncompleteTask(taskCopy.id);
			void this.plugin.savePluginData();
			this.renderMatrix();
			notice.hide();
		});
	}

	private async handleUncompleteTask(taskId: string): Promise<void> {
		this.plugin.uncompleteTask(taskId);
		await this.plugin.savePluginData();
		this.renderMatrix();
	}

	private async handleEditTask(taskId: string, title: string, dueDate: string | null): Promise<void> {
		this.plugin.editTask(taskId, title, dueDate);
		await this.plugin.savePluginData();
		this.renderMatrix();
	}

	private renderEditForm(taskEl: HTMLElement, task: Task): void {
		// Disable drag while editing
		taskEl.setAttribute("draggable", "false");
		taskEl.empty();
		taskEl.addClass("pm-task-editing");

		const formEl = taskEl.createDiv({ cls: "pm-edit-form" });

		const titleInput = formEl.createEl("input", {
			cls: "pm-task-input",
			attr: { type: "text", value: task.title },
		});

		const dateRow = formEl.createDiv({ cls: "pm-form-date-row" });
		dateRow.createEl("label", { text: "Due:", cls: "pm-date-label" });
		const dateInput = dateRow.createEl("input", {
			cls: "pm-date-input",
			attr: { type: "date", value: task.dueDate || "" },
		});

		const btnRow = formEl.createDiv({ cls: "pm-form-btn-row" });
		const saveBtn = btnRow.createEl("button", { text: "Save", cls: "pm-form-submit" });
		const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "pm-form-cancel" });

		const save = () => {
			const title = titleInput.value.trim();
			if (!title) {
				titleInput.addClass("pm-input-error");
				return;
			}
			const dueDate = dateInput.value || null;
			void this.handleEditTask(task.id, title, dueDate);
		};

		saveBtn.addEventListener("click", save);
		cancelBtn.addEventListener("click", () => this.renderMatrix());

		titleInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") save();
			else if (e.key === "Escape") this.renderMatrix();
		});

		titleInput.addEventListener("input", () => {
			titleInput.removeClass("pm-input-error");
		});

		// Scroll form into view when keyboard opens on mobile
		titleInput.addEventListener("focus", () => {
			window.setTimeout(() => {
				formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}, 300);
		});

		// Prevent clicks inside form from bubbling to drag handlers
		formEl.addEventListener("mousedown", (e) => e.stopPropagation());
		formEl.addEventListener("touchstart", (e) => e.stopPropagation());

		titleInput.focus();
		titleInput.select();
	}

	// ==================== COMPLETED SECTION ====================

	private renderCompletedSection(container: HTMLElement, tasks: Task[]): void {
		const section = container.createDiv({ cls: "pm-completed-section" });

		// Header
		const header = section.createDiv({ cls: "pm-completed-header" });
		const chevron = header.createSpan({ cls: "pm-completed-chevron" });
		chevron.textContent = "\u25B6";
		header.createSpan({ text: `Completed (${tasks.length})` });

		// List — expanded if user toggled it open, or collapsed by default
		const isExpanded = this.completedSectionExpanded;
		const list = section.createDiv({
			cls: isExpanded ? "pm-completed-list" : "pm-completed-list pm-hidden",
		});
		if (isExpanded) {
			chevron.addClass("pm-completed-chevron-open");
		}

		for (const task of tasks) {
			this.renderCompletedTask(list, task);
		}

		header.addEventListener("click", () => {
			const isHidden = list.hasClass("pm-hidden");
			list.toggleClass("pm-hidden", !isHidden);
			chevron.toggleClass("pm-completed-chevron-open", isHidden);
			this.completedSectionExpanded = isHidden;
		});
	}

	private renderCompletedTask(listEl: HTMLElement, task: Task): void {
		const taskEl = listEl.createDiv({ cls: "pm-completed-task" });

		// Checked checkbox (click to revive)
		const checkbox = taskEl.createDiv({ cls: "pm-task-checkbox pm-checked" });
		checkbox.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.handleUncompleteTask(task.id);
		});

		// Title (strikethrough via CSS)
		taskEl.createDiv({ cls: "pm-completed-task-title", text: task.title });

		// Quadrant color dot
		const dot = taskEl.createDiv({ cls: "pm-quadrant-dot" });
		dot.setCssStyles({ background: QUADRANT_COLORS[task.quadrant] });

		// Completion time
		taskEl.createDiv({
			cls: "pm-completed-task-time",
			text: formatCompletedDate(task.completedAt!),
		});

		// Delete button
		const deleteBtn = taskEl.createEl("button", {
			cls: "pm-task-delete",
			attr: { "aria-label": "Delete task" },
		});
		deleteBtn.textContent = "\u00d7";

		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.handleDeleteTask(task.id);
		});
	}

	// ==================== DROP POSITION ====================

	/** Tasks in a quadrant that would stay where they are: all but the one being dragged. */
	private getStationaryTaskEls(quadrantEl: HTMLElement, draggedTaskId: string): HTMLElement[] {
		return Array.from(quadrantEl.querySelectorAll<HTMLElement>(".pm-task")).filter(
			(el) => el.getAttribute("data-task-id") !== draggedTaskId
		);
	}

	/**
	 * Where in a quadrant a task dropped at this height would land: the number
	 * of stationary tasks whose vertical midpoint is above the pointer.
	 */
	private getDropIndex(quadrantEl: HTMLElement, clientY: number, draggedTaskId: string): number {
		let index = 0;
		for (const el of this.getStationaryTaskEls(quadrantEl, draggedTaskId)) {
			const rect = el.getBoundingClientRect();
			if (clientY > rect.top + rect.height / 2) index++;
		}
		return index;
	}

	/**
	 * Show a line in the quadrant's task list where the dragged task would land.
	 * Hidden when the drop would change nothing, and over an empty quadrant
	 * (where the quadrant highlight already says everything).
	 */
	private updateDropIndicator(quadrantEl: HTMLElement, clientY: number, draggedTaskId: string): void {
		const listEl = quadrantEl.querySelector<HTMLElement>(".pm-task-list");
		if (!listEl) {
			this.clearDropIndicator();
			return;
		}

		const allTaskEls = Array.from(listEl.querySelectorAll<HTMLElement>(".pm-task"));
		const stationary = this.getStationaryTaskEls(quadrantEl, draggedTaskId);
		const index = this.getDropIndex(quadrantEl, clientY, draggedTaskId);
		// -1 when the task is being dragged in from another quadrant
		const currentIndex = allTaskEls.findIndex(
			(el) => el.getAttribute("data-task-id") === draggedTaskId
		);

		if (stationary.length === 0 || currentIndex === index) {
			this.clearDropIndicator();
			return;
		}

		const before = index < stationary.length ? stationary[index] : null;
		if (!this.dropIndicator) {
			this.dropIndicator = listEl.createDiv({ cls: "pm-drop-indicator" });
		}
		if (this.dropIndicator.parentElement !== listEl || this.dropIndicator.nextElementSibling !== before) {
			listEl.insertBefore(this.dropIndicator, before);
		}
	}

	private clearDropIndicator(): void {
		if (this.dropIndicator) {
			this.dropIndicator.remove();
			this.dropIndicator = null;
		}
	}

	// ==================== DESKTOP DRAG & DROP ====================

	private setupDesktopDrag(taskEl: HTMLElement, taskId: string): void {
		taskEl.addEventListener("dragstart", (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.setData("text/plain", taskId);
				e.dataTransfer.effectAllowed = "move";
			}
			taskEl.addClass("pm-dragging");
			this.draggedTaskId = taskId;
		});

		taskEl.addEventListener("dragend", () => {
			taskEl.removeClass("pm-dragging");
			this.draggedTaskId = null;
			this.clearDropIndicator();
			this.contentEl.querySelectorAll(".pm-drop-target").forEach((el) => {
				(el as HTMLElement).removeClass("pm-drop-target");
			});
		});
	}

	private setupQuadrantDropZone(quadrantEl: HTMLElement, quadrant: Quadrant): void {
		quadrantEl.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "move";
			}
			quadrantEl.addClass("pm-drop-target");
			// The dragged data cannot be read during dragover, so rely on the ID
			// recorded at dragstart. It is unset for drags that began elsewhere.
			if (this.draggedTaskId) {
				this.updateDropIndicator(quadrantEl, e.clientY, this.draggedTaskId);
			}
		});

		quadrantEl.addEventListener("dragleave", (e: DragEvent) => {
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!quadrantEl.contains(relatedTarget)) {
				quadrantEl.removeClass("pm-drop-target");
				// Only if it is still ours: the next quadrant may already have claimed it
				if (this.dropIndicator && quadrantEl.contains(this.dropIndicator)) {
					this.clearDropIndicator();
				}
			}
		});

		quadrantEl.addEventListener("drop", (e: DragEvent) => {
			e.preventDefault();
			quadrantEl.removeClass("pm-drop-target");
			this.clearDropIndicator();

			const taskId = e.dataTransfer?.getData("text/plain");
			if (!taskId) return;

			const index = this.getDropIndex(quadrantEl, e.clientY, taskId);
			if (this.plugin.moveTaskToIndex(taskId, quadrant, index)) {
				this.renderMatrix();
				void this.plugin.savePluginData();
			}
		});
	}

	// ==================== MOBILE TOUCH DRAG & DROP ====================

	private setupTouchDrag(taskEl: HTMLElement, taskId: string): void {
		let startX = 0;
		let startY = 0;
		let isDragging = false;

		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length !== 1) return;

			const touch = e.touches[0];
			startX = touch.clientX;
			startY = touch.clientY;
			isDragging = false;

			this.touchTimeout = window.setTimeout(() => {
				isDragging = true;
				this.draggedEl = taskEl;
				this.draggedTaskId = taskId;

				// Create visual clone
				const clone = taskEl.cloneNode(true) as HTMLElement;
				clone.addClass("pm-touch-clone");
				clone.setCssStyles({
					left: `${startX - 50}px`,
					top: `${startY - 20}px`,
					width: `${taskEl.offsetWidth}px`,
				});
				// The task's own document: in a popout window that is not the global one
				taskEl.doc.body.appendChild(clone);
				this.touchClone = clone;

				taskEl.addClass("pm-dragging");

				if (navigator.vibrate) {
					navigator.vibrate(50);
				}
			}, LONG_PRESS_MS);
		};

		const onTouchMove = (e: TouchEvent) => {
			const touch = e.touches[0];
			const dx = Math.abs(touch.clientX - startX);
			const dy = Math.abs(touch.clientY - startY);

			// Cancel drag initiation if finger moves too much before timeout
			if (!isDragging && (dx > LONG_PRESS_MOVE_TOLERANCE_PX || dy > LONG_PRESS_MOVE_TOLERANCE_PX)) {
				if (this.touchTimeout !== null) {
					window.clearTimeout(this.touchTimeout);
					this.touchTimeout = null;
				}
				return;
			}

			if (!isDragging || !this.touchClone) return;

			e.preventDefault(); // Prevent scrolling while dragging

			this.touchClone.setCssStyles({
				left: `${touch.clientX - 50}px`,
				top: `${touch.clientY - 20}px`,
			});

			this.lastTouchPoint = { x: touch.clientX, y: touch.clientY };
			this.updateTouchDropTarget(touch.clientX, touch.clientY);
			this.updateAutoScroll();
		};

		const onTouchEnd = (e: TouchEvent) => {
			if (this.touchTimeout !== null) {
				window.clearTimeout(this.touchTimeout);
				this.touchTimeout = null;
			}

			if (!isDragging || !this.draggedTaskId) {
				this.cleanupTouchDrag();
				return;
			}

			const touch = e.changedTouches[0];
			const targetEl = this.getQuadrantElAtPoint(touch.clientX, touch.clientY);

			if (targetEl) {
				const targetQuadrant = targetEl.getAttribute("data-quadrant") as Quadrant;
				const index = this.getDropIndex(targetEl, touch.clientY, this.draggedTaskId);
				if (this.plugin.moveTaskToIndex(this.draggedTaskId, targetQuadrant, index)) {
					void this.plugin.savePluginData();
				}
			}

			isDragging = false;
			this.cleanupTouchDrag();
			this.renderMatrix();
		};

		const onTouchCancel = () => {
			if (this.touchTimeout !== null) {
				window.clearTimeout(this.touchTimeout);
				this.touchTimeout = null;
			}
			isDragging = false;
			this.cleanupTouchDrag();
		};

		taskEl.addEventListener("touchstart", onTouchStart, { passive: true });
		taskEl.addEventListener("touchmove", onTouchMove, { passive: false });
		taskEl.addEventListener("touchend", onTouchEnd);
		taskEl.addEventListener("touchcancel", onTouchCancel);
	}

	/** Highlight the quadrant under the finger and show where the task would land in it. */
	private updateTouchDropTarget(x: number, y: number): void {
		const targetEl = this.getQuadrantElAtPoint(x, y);
		this.contentEl.querySelectorAll(".pm-drop-target").forEach((el) => {
			if (el !== targetEl) (el as HTMLElement).removeClass("pm-drop-target");
		});

		if (targetEl && this.draggedTaskId) {
			targetEl.addClass("pm-drop-target");
			this.updateDropIndicator(targetEl, y, this.draggedTaskId);
		} else {
			this.clearDropIndicator();
		}
	}

	private cleanupTouchDrag(): void {
		this.stopAutoScroll();
		this.lastTouchPoint = null;
		this.clearDropIndicator();

		if (this.touchClone) {
			this.touchClone.remove();
			this.touchClone = null;
		}
		if (this.draggedEl) {
			this.draggedEl.removeClass("pm-dragging");
			this.draggedEl = null;
		}
		this.draggedTaskId = null;

		this.contentEl.querySelectorAll(".pm-drop-target").forEach((el) => {
			(el as HTMLElement).removeClass("pm-drop-target");
		});
	}

	private getQuadrantElAtPoint(x: number, y: number): HTMLElement | null {
		const quadrants = this.contentEl.querySelectorAll<HTMLElement>(".pm-quadrant");
		for (const qEl of Array.from(quadrants)) {
			const rect = qEl.getBoundingClientRect();
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				return qEl;
			}
		}
		return null;
	}

	// ==================== TOUCH AUTO-SCROLL ====================
	// Scrolling is blocked while a touch drag is in progress, so without this a
	// task could never be dragged to a position that is currently off-screen.

	/** Start or stop the scroll loop to match where the finger is now. */
	private updateAutoScroll(): void {
		if (!this.getAutoScrollStep()) {
			this.stopAutoScroll();
			return;
		}
		if (this.autoScrollFrame === null) {
			this.autoScrollFrame = window.requestAnimationFrame(() => this.autoScrollTick());
		}
	}

	private autoScrollTick(): void {
		this.autoScrollFrame = null;
		const step = this.getAutoScrollStep();
		if (!step || !this.lastTouchPoint) return;

		step.el.scrollTop += step.delta;
		// The list moved under a finger that did not: the drop position changed
		this.updateTouchDropTarget(this.lastTouchPoint.x, this.lastTouchPoint.y);

		this.autoScrollFrame = window.requestAnimationFrame(() => this.autoScrollTick());
	}

	private stopAutoScroll(): void {
		if (this.autoScrollFrame !== null) {
			window.cancelAnimationFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}
	}

	/** Which element to scroll and by how much this frame, or null if the finger is not near an edge. */
	private getAutoScrollStep(): { el: HTMLElement; delta: number } | null {
		const point = this.lastTouchPoint;
		if (!point || !this.draggedTaskId) return null;

		const el = this.getScrollContainerAt(point.x, point.y);
		if (!el) return null;

		// Only the part of the scroll area that is actually on screen has edges to reach for
		const rect = el.getBoundingClientRect();
		const top = Math.max(rect.top, 0);
		const bottom = Math.min(rect.bottom, window.innerHeight);

		const fromTop = point.y - top;
		const fromBottom = bottom - point.y;
		if (fromTop < AUTO_SCROLL_EDGE_PX) {
			return { el, delta: -autoScrollSpeed(fromTop) };
		}
		if (fromBottom < AUTO_SCROLL_EDGE_PX) {
			return { el, delta: autoScrollSpeed(fromBottom) };
		}
		return null;
	}

	/**
	 * The element that scrolls at this point. On phones the whole view is one
	 * scroll container; on wider screens each quadrant's task list scrolls.
	 */
	private getScrollContainerAt(x: number, y: number): HTMLElement | null {
		const quadrantEl = this.getQuadrantElAtPoint(x, y);
		const listEl = quadrantEl ? quadrantEl.querySelector<HTMLElement>(".pm-task-list") : null;
		for (const el of [listEl, this.contentEl]) {
			if (el && isScrollable(el)) return el;
		}
		return null;
	}

}

function isScrollable(el: HTMLElement): boolean {
	if (el.scrollHeight <= el.clientHeight) return false;
	const overflowY = getComputedStyle(el).overflowY;
	return overflowY === "auto" || overflowY === "scroll";
}

/** Faster the closer the finger is to the edge; full speed at or past it. */
function autoScrollSpeed(distanceFromEdge: number): number {
	const closeness = 1 - Math.max(distanceFromEdge, 0) / AUTO_SCROLL_EDGE_PX;
	return Math.ceil(AUTO_SCROLL_MAX_SPEED_PX * closeness);
}

// ==================== EXPORTED UTILITIES ====================

export function formatDueDate(dateStr: string): string {
	const date = new Date(dateStr + "T00:00:00");
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const diffMs = date.getTime() - today.getTime();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Tomorrow";
	if (diffDays === -1) return "Yesterday";
	if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
	if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
	});
}

export function isDueDatePast(dateStr: string): boolean {
	const date = new Date(dateStr + "T23:59:59");
	return date < new Date();
}

export function formatCompletedDate(isoDateStr: string): string {
	const completed = new Date(isoDateStr);
	const now = new Date();
	const diffMs = now.getTime() - completed.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return "Just now";
	if (diffMin < 60) return `${diffMin} min ago`;
	if (diffHours < 24) return `${diffHours} hours ago`;
	if (diffDays === 1) return "Yesterday";
	return `${diffDays} days ago`;
}
