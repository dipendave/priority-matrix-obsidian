import { Plugin, WorkspaceLeaf } from "obsidian";
import { PriorityMatrixView } from "./view";
import {
	PriorityMatrixData,
	DEFAULT_DATA,
	VIEW_TYPE_PRIORITY,
	Task,
	Quadrant,
} from "./types";

export default class PriorityMatrixPlugin extends Plugin {
	data: PriorityMatrixData = DEFAULT_DATA;

	async onload(): Promise<void> {
		await this.loadPluginData();

		this.registerView(
			VIEW_TYPE_PRIORITY,
			(leaf: WorkspaceLeaf) => new PriorityMatrixView(leaf, this)
		);

		this.addRibbonIcon("layout-grid", "Task priority matrix", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-view",
			name: "Open matrix",
			callback: () => {
				void this.activateView();
			},
		});
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_PRIORITY);

		if (leaves.length > 0) {
			await workspace.revealLeaf(leaves[0]);
			return;
		}

		const leaf = workspace.getLeaf(false);
		await leaf.setViewState({
			type: VIEW_TYPE_PRIORITY,
			active: true,
		});
		await workspace.revealLeaf(leaf);
	}

	async loadPluginData(): Promise<void> {
		const loaded = await this.loadData();
		this.data = Object.assign({}, DEFAULT_DATA, loaded);
		if (!Array.isArray(this.data.tasks)) {
			this.data.tasks = [];
		}
	}

	async savePluginData(): Promise<void> {
		await this.saveData(this.data);
	}

	async onExternalSettingsChange(): Promise<void> {
		await this.loadPluginData();
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PRIORITY);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof PriorityMatrixView) {
				view.renderMatrix();
			}
		}
	}

	getTasksForQuadrant(quadrant: Quadrant): Task[] {
		return this.data.tasks
			.filter((t) => t.quadrant === quadrant && !t.completedAt)
			.sort((a, b) => a.order - b.order);
	}

	completeTask(taskId: string): boolean {
		const task = this.data.tasks.find((t) => t.id === taskId);
		if (!task) return false;
		task.completedAt = new Date().toISOString();
		return true;
	}

	uncompleteTask(taskId: string): boolean {
		const task = this.data.tasks.find((t) => t.id === taskId);
		if (!task || !task.completedAt) return false;
		task.completedAt = null;
		return true;
	}

	getCompletedTasks(): Task[] {
		return this.data.tasks
			.filter((t) => !!t.completedAt)
			.sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
	}

	addTask(title: string, quadrant: Quadrant, dueDate: string | null): Task {
		const tasksInQuadrant = this.getTasksForQuadrant(quadrant);
		const newTask: Task = {
			id: this.generateId(),
			title: title.trim(),
			quadrant,
			dueDate,
			createdAt: new Date().toISOString(),
			order: tasksInQuadrant.length,
		};
		this.data.tasks.push(newTask);
		return newTask;
	}

	deleteTask(taskId: string): void {
		this.data.tasks = this.data.tasks.filter((t) => t.id !== taskId);
	}

	restoreTask(task: Task): void {
		this.data.tasks.push(task);
	}

	editTask(taskId: string, title: string, dueDate: string | null): boolean {
		const task = this.data.tasks.find((t) => t.id === taskId);
		if (!task) return false;
		task.title = title.trim();
		task.dueDate = dueDate;
		return true;
	}

	moveTask(taskId: string, targetQuadrant: Quadrant): void {
		const task = this.data.tasks.find((t) => t.id === taskId);
		if (task) {
			task.quadrant = targetQuadrant;
			const tasksInTarget = this.data.tasks.filter(
				(t) => t.quadrant === targetQuadrant && t.id !== taskId
			);
			task.order = tasksInTarget.length;
		}
	}

	private generateId(): string {
		if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
			return crypto.randomUUID();
		}
		return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
	}
}
