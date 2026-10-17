import { describe, expect, it } from "vitest";
import {
  addDays, buildWeeks, daysBetween, localDate, localHour, programEndDate, programPhase,
  snapToWeekday, weekdayOf, zonedTimeToUtc, isDateOnly,
} from "./dates";

describe("calendar dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates real dates only", () => {
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-13-01")).toBe(false);
  });

  it("builds 12- and 13-week programmes of seven-day weeks", () => {
    const weeks = buildWeeks("2026-09-07", 13);
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toEqual({ weekNumber: 1, startsOn: "2026-09-07", endsOn: "2026-09-13" });
    expect(weeks[12].startsOn).toBe("2026-11-30");
    expect(programEndDate("2026-09-07", 12)).toBe("2026-11-29");
    expect(daysBetween("2026-09-07", programEndDate("2026-09-07", 12))).toBe(83);
  });

  it("snaps a start date forward to the configured weekday", () => {
    expect(weekdayOf("2026-09-09")).toBe(3); // Wednesday
    expect(snapToWeekday("2026-09-09", 1)).toBe("2026-09-14");
    expect(snapToWeekday("2026-09-14", 1)).toBe("2026-09-14");
  });

  it("locates today within a programme", () => {
    expect(programPhase("2026-09-07", 12, "2026-09-01")).toEqual({ phase: "before", daysUntilStart: 6 });
    expect(programPhase("2026-09-07", 12, "2026-09-07")).toEqual({ phase: "running", weekNumber: 1 });
    expect(programPhase("2026-09-07", 12, "2026-09-14")).toEqual({ phase: "running", weekNumber: 2 });
    expect(programPhase("2026-09-07", 12, "2026-11-29")).toEqual({ phase: "running", weekNumber: 12 });
    expect(programPhase("2026-09-07", 12, "2026-11-30")).toEqual({ phase: "after" });
  });
});

describe("timezones", () => {
  // 23:30 UTC on Sunday is already Monday in Lagos (UTC+1) but still Sunday in New York.
  const instant = new Date("2026-09-13T23:30:00Z");

  it("derives the local date in the programme zone, not the server's", () => {
    expect(localDate(instant, "Africa/Lagos")).toBe("2026-09-14");
    expect(localDate(instant, "America/New_York")).toBe("2026-09-13");
    expect(localDate(instant, "UTC")).toBe("2026-09-13");
    expect(localHour(instant, "Africa/Lagos")).toBe(0);
  });

  it("converts local wall time to the right instant", () => {
    expect(zonedTimeToUtc("2026-09-14", 9, 0, "Africa/Lagos").toISOString()).toBe("2026-09-14T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-14", 9, 0, "Europe/London").toISOString()).toBe("2026-01-14T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-14", 9, 0, "Europe/London").toISOString()).toBe("2026-07-14T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-14", 23, 59, "America/Los_Angeles").toISOString()).toBe("2026-07-15T06:59:00.000Z");
  });

  it("handles a DST change inside a week", () => {
    // UK clocks go back on 25 Oct 2026.
    expect(zonedTimeToUtc("2026-10-24", 12, 0, "Europe/London").toISOString()).toBe("2026-10-24T11:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-26", 12, 0, "Europe/London").toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });
});
