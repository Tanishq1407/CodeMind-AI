import type { ActivityDay } from "./coding-activity";

export type ActivityMonth = { key: string; label: string; days: ActivityDay[] };

export function groupActivityMonths(days: ActivityDay[]): ActivityMonth[] {
  const months = new Map<string, ActivityDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const monthDays = months.get(key) ?? [];
    monthDays.push(day);
    months.set(key, monthDays);
  }
  return [...months.entries()].map(([key, monthDays]) => ({
    key,
    label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00.000Z`)),
    days: monthDays,
  }));
}
