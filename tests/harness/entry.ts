/**
 * Browser harness for Playwright.
 *
 * Runs the plugin's real view and data code in a plain web page, with the
 * Obsidian API swapped for the same mock the Jest tests use. This lets
 * Playwright drive genuine touch and mouse input against real layout, which
 * jsdom cannot do.
 *
 * Bundled to harness.bundle.js by global-setup.ts before the Playwright run.
 */
import PriorityMatrixPlugin from "../../src/main";
import { PriorityMatrixView } from "../../src/view";
import { DEFAULT_DATA, Quadrant } from "../../src/types";

type TasksByQuadrant = Partial<Record<Quadrant, string[]>>;

interface MatrixHandle {
	/** Stored titles of a quadrant's active tasks, in order */
	titles(quadrant: Quadrant): string[];
	/** How many times the plugin has saved since mounting */
	saveCount(): number;
}

declare global {
	interface Window {
		mountMatrix(tasks: TasksByQuadrant): void;
		matrix: MatrixHandle;
	}
}

window.mountMatrix = (tasks: TasksByQuadrant) => {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	const plugin = new PriorityMatrixPlugin({} as any, {} as any);
	plugin.data = JSON.parse(JSON.stringify(DEFAULT_DATA));

	let saves = 0;
	plugin.saveData = () => {
		saves++;
		return Promise.resolve();
	};

	for (const [quadrant, titles] of Object.entries(tasks)) {
		for (const title of titles ?? []) {
			plugin.addTask(title, quadrant as Quadrant, null);
		}
	}

	const view = new PriorityMatrixView({} as any, plugin);
	/* eslint-enable @typescript-eslint/no-explicit-any */

	const leaf = document.getElementById("leaf");
	if (!leaf) throw new Error("Harness page is missing #leaf");
	while (leaf.firstChild) leaf.removeChild(leaf.firstChild);
	leaf.appendChild(view.contentEl);
	view.renderMatrix();

	window.matrix = {
		titles: (quadrant) => plugin.getTasksForQuadrant(quadrant).map((t) => t.title),
		saveCount: () => saves,
	};
};
