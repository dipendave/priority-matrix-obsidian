import { formatDueDate, isDueDatePast, formatCompletedDate } from "../src/view";

describe("formatDueDate", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('returns "Today" for today\'s date', () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(formatDueDate("2025-06-15")).toBe("Today");
	});

	it('returns "Tomorrow" for tomorrow\'s date', () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(formatDueDate("2025-06-16")).toBe("Tomorrow");
	});

	it('returns "Yesterday" for yesterday\'s date', () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(formatDueDate("2025-06-14")).toBe("Yesterday");
	});

	it('returns "In N days" for 2-7 days in the future', () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(formatDueDate("2025-06-17")).toBe("In 2 days");
		expect(formatDueDate("2025-06-20")).toBe("In 5 days");
		expect(formatDueDate("2025-06-22")).toBe("In 7 days");
	});

	it('returns "N days ago" for dates more than 1 day in the past', () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(formatDueDate("2025-06-13")).toBe("2 days ago");
		expect(formatDueDate("2025-06-10")).toBe("5 days ago");
	});

	it("returns a formatted date for dates more than 7 days in the future", () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		const result = formatDueDate("2025-06-30");
		// Should contain "Jun" and "30" (locale-dependent format)
		expect(result).toContain("Jun");
		expect(result).toContain("30");
	});
});

describe("isDueDatePast", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("returns false for a future date", () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(isDueDatePast("2025-06-20")).toBe(false);
	});

	it("returns false for today (end of day has not passed)", () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(isDueDatePast("2025-06-15")).toBe(false);
	});

	it("returns true for a past date", () => {
		jest.setSystemTime(new Date("2025-06-15T12:00:00"));
		expect(isDueDatePast("2025-06-14")).toBe(true);
	});
});

describe("formatCompletedDate", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('returns "Just now" for less than 1 minute ago', () => {
		jest.setSystemTime(new Date("2026-01-01T12:00:30Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("Just now");
	});

	it('returns "X min ago" for less than 1 hour', () => {
		jest.setSystemTime(new Date("2026-01-01T12:15:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("15 min ago");
	});

	it('returns "1 min ago" for exactly 1 minute', () => {
		jest.setSystemTime(new Date("2026-01-01T12:01:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("1 min ago");
	});

	it('returns "X hours ago" for less than 24 hours', () => {
		jest.setSystemTime(new Date("2026-01-01T15:00:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("3 hours ago");
	});

	it('returns "1 hours ago" for exactly 1 hour', () => {
		jest.setSystemTime(new Date("2026-01-01T13:00:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("1 hours ago");
	});

	it('returns "Yesterday" for 1 day ago', () => {
		jest.setSystemTime(new Date("2026-01-02T12:00:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("Yesterday");
	});

	it('returns "X days ago" for multiple days', () => {
		jest.setSystemTime(new Date("2026-01-06T12:00:00Z"));
		expect(formatCompletedDate("2026-01-01T12:00:00Z")).toBe("5 days ago");
	});
});
