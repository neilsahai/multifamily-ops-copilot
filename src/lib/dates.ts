import type { ISODate } from "@/data/types";

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight UTC for a calendar date. Never uses the viewer's local clock or zone. */
export function toUtcMs(date: ISODate): number {
  if (!ISO_DATE.test(date)) throw new Error(`Invalid ISO date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function addDays(date: ISODate, days: number): ISODate {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive on both ends. */
export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  const t = toUtcMs(date);
  return t >= toUtcMs(start) && t <= toUtcMs(end);
}

const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Sep 26, 2026" — rendered in UTC so every viewer sees the same date. */
export function formatDate(date: ISODate): string {
  return formatter.format(new Date(toUtcMs(date)));
}
