import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatDate, isWithin } from "./dates";

describe("dates (UTC)", () => {
  it("counts whole days across month and DST boundaries", () => {
    expect(daysBetween("2026-09-02", "2026-09-26")).toBe(24);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // US DST change
    expect(daysBetween("2026-11-30", "2026-11-01")).toBe(-29);
  });

  it("adds days across year boundaries", () => {
    expect(addDays("2026-09-26", 90)).toBe("2026-12-25");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-09-26", -90)).toBe("2026-06-28");
  });

  it("treats windows as inclusive on both ends", () => {
    expect(isWithin("2026-06-28", "2026-06-28", "2026-09-26")).toBe(true);
    expect(isWithin("2026-09-26", "2026-06-28", "2026-09-26")).toBe(true);
    expect(isWithin("2026-06-27", "2026-06-28", "2026-09-26")).toBe(false);
  });

  it("formats in UTC regardless of local zone", () => {
    expect(formatDate("2026-09-26")).toBe("Sep 26, 2026");
  });

  it("rejects malformed dates", () => {
    expect(() => daysBetween("9/26/2026", "2026-09-26")).toThrow();
  });
});
