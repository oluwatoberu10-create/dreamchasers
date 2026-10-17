/**
 * Calendar maths in a programme's own timezone.
 *
 * A programme week is a run of *local* calendar dates (YYYY-MM-DD strings) in
 * the programme's IANA zone. Instants (Date) are converted to local dates with
 * Intl, never with the server's zone — a server in UTC and a programme in
 * Lagos or Los Angeles must agree on when week 4 starts.
 */

export type DateOnly = string; // "YYYY-MM-DD"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(v: unknown): v is DateOnly {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Pure date arithmetic on calendar dates — no timezone involved. */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 864e5);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: DateOnly): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(instant: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}

/** The local calendar date of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): DateOnly {
  const p = partsInZone(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function localHour(instant: Date, timeZone: string): number {
  return partsInZone(instant, timeZone).hour;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads `date hh:mm`.
 * Two passes settle DST transitions; a wall time that does not exist (spring
 * forward gap) resolves to the instant just after the gap.
 */
export function zonedTimeToUtc(date: DateOnly, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute, 0);
  let guess = wall - offsetMs(new Date(wall), timeZone);
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Start (inclusive) of a local date, as an instant. */
export function startOfLocalDay(date: DateOnly, timeZone: string): Date {
  return zonedTimeToUtc(date, 0, 0, timeZone);
}

/** End (exclusive) of a local date — i.e. midnight starting the next day. */
export function endOfLocalDay(date: DateOnly, timeZone: string): Date {
  return zonedTimeToUtc(addDays(date, 1), 0, 0, timeZone);
}

export type WeekSpan = { weekNumber: number; startsOn: DateOnly; endsOn: DateOnly };

/** Week n begins on startDate + 7(n-1) and lasts seven local days. */
export function buildWeeks(startDate: DateOnly, weeksCount: number): WeekSpan[] {
  return Array.from({ length: weeksCount }, (_, i) => ({
    weekNumber: i + 1,
    startsOn: addDays(startDate, i * 7),
    endsOn: addDays(startDate, i * 7 + 6),
  }));
}

export function programEndDate(startDate: DateOnly, weeksCount: number): DateOnly {
  return addDays(startDate, weeksCount * 7 - 1);
}

/** The first date on or after `date` that falls on `weekday`. */
export function snapToWeekday(date: DateOnly, weekday: number): DateOnly {
  const diff = (weekday - weekdayOf(date) + 7) % 7;
  return addDays(date, diff);
}

export type ProgramPhase =
  | { phase: "before"; daysUntilStart: number }
  | { phase: "running"; weekNumber: number }
  | { phase: "after" };

/** Where `today` (a local date) sits relative to a programme. */
export function programPhase(startDate: DateOnly, weeksCount: number, today: DateOnly): ProgramPhase {
  const offset = daysBetween(startDate, today);
  if (offset < 0) return { phase: "before", daysUntilStart: -offset };
  const week = Math.floor(offset / 7) + 1;
  if (week > weeksCount) return { phase: "after" };
  return { phase: "running", weekNumber: week };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
