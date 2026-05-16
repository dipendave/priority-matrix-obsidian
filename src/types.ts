export enum Quadrant {
	Q1 = "q1", // Urgent & Important → Do
	Q2 = "q2", // Not Urgent & Important → Schedule
	Q3 = "q3", // Urgent & Not Important → Delegate
	Q4 = "q4", // Not Urgent & Not Important → Eliminate
}

export interface QuadrantMeta {
	id: Quadrant;
	label: string;
	action: string;
	description: string;
	colorClass: string;
}

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
	[Quadrant.Q1]: {
		id: Quadrant.Q1,
		label: "Urgent & Important",
		action: "Do",
		description: "Do these tasks immediately",
		colorClass: "pm-quadrant-q1",
	},
	[Quadrant.Q2]: {
		id: Quadrant.Q2,
		label: "Not Urgent & Important",
		action: "Schedule",
		description: "Schedule time for these tasks",
		colorClass: "pm-quadrant-q2",
	},
	[Quadrant.Q3]: {
		id: Quadrant.Q3,
		label: "Urgent & Not Important",
		action: "Delegate",
		description: "Delegate these tasks if possible",
		colorClass: "pm-quadrant-q3",
	},
	[Quadrant.Q4]: {
		id: Quadrant.Q4,
		label: "Not Urgent & Not Important",
		action: "Eliminate",
		description: "Consider eliminating these tasks",
		colorClass: "pm-quadrant-q4",
	},
};

export interface Task {
	id: string;
	title: string;
	quadrant: Quadrant;
	dueDate: string | null;    // YYYY-MM-DD or null
	createdAt: string;         // ISO 8601 datetime
	order: number;
	completedAt?: string | null; // ISO 8601 datetime when completed, falsy = active
}

export const QUADRANT_COLORS: Record<Quadrant, string> = {
	[Quadrant.Q1]: "#ef4444",
	[Quadrant.Q2]: "#3b82f6",
	[Quadrant.Q3]: "#f59e0b",
	[Quadrant.Q4]: "#6b7280",
};

export interface PriorityMatrixData {
	tasks: Task[];
	version: number;
	hasSeenDragHint?: boolean;
}

export const DEFAULT_DATA: PriorityMatrixData = {
	tasks: [],
	version: 1,
};

export const VIEW_TYPE_PRIORITY = "priority-matrix-view";
