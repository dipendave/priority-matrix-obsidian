import {
	Quadrant,
	QUADRANT_META,
	DEFAULT_DATA,
	VIEW_TYPE_PRIORITY,
} from "../src/types";

describe("QUADRANT_META", () => {
	it("has an entry for every Quadrant enum value", () => {
		const allQuadrants = Object.values(Quadrant);
		expect(allQuadrants).toHaveLength(4);
		for (const q of allQuadrants) {
			expect(QUADRANT_META[q]).toBeDefined();
			expect(QUADRANT_META[q].id).toBe(q);
		}
	});

	it("each entry has required fields", () => {
		for (const q of Object.values(Quadrant)) {
			const meta = QUADRANT_META[q];
			expect(meta.label).toBeTruthy();
			expect(meta.action).toBeTruthy();
			expect(meta.description).toBeTruthy();
			expect(meta.colorClass).toBeTruthy();
		}
	});

	it("each entry has a unique colorClass", () => {
		const colorClasses = Object.values(QUADRANT_META).map((m) => m.colorClass);
		expect(new Set(colorClasses).size).toBe(colorClasses.length);
	});
});

describe("DEFAULT_DATA", () => {
	it("has an empty tasks array", () => {
		expect(DEFAULT_DATA.tasks).toEqual([]);
	});

	it("has version 1", () => {
		expect(DEFAULT_DATA.version).toBe(1);
	});
});

describe("VIEW_TYPE_PRIORITY", () => {
	it("is a non-empty string", () => {
		expect(typeof VIEW_TYPE_PRIORITY).toBe("string");
		expect(VIEW_TYPE_PRIORITY.length).toBeGreaterThan(0);
	});
});
