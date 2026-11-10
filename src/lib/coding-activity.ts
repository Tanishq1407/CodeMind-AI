import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
export const ACTIVITY_TIME_ZONE = "UTC" as const;
export const ACTIVITY_WINDOW_DAYS = 365;

export type DailyActivityInput = { day: string; count: number | bigint };
export type ActivityDay = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
export type CodingActivity = {
  timeZone: typeof ACTIVITY_TIME_ZONE;
  startDate: string;
  endDate: string;
  totalAnalyses: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  days: ActivityDay[];
};

export function utcDay(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4,"0")}-${(date.getUTCMonth()+1).toString().padStart(2,"0")}-${date.getUTCDate().toString().padStart(2,"0")}`;
}

function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month-1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? timestamp : null;
}

function addDays(value: string, amount: number): string {
  const timestamp = parseDay(value);
  if (timestamp === null) throw new Error("Invalid UTC calendar date.");
  return utcDay(new Date(timestamp + amount * DAY_MS));
}

export function activityLevel(count: number): ActivityDay["level"] {
  if (count < 1) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}


export function buildCodingActivity(rows: DailyActivityInput[], now: Date): CodingActivity {
  const today = utcDay(now);
  const todayTimestamp = parseDay(today)!;
  const startDate = utcDay(new Date(todayTimestamp - (ACTIVITY_WINDOW_DAYS-1)*DAY_MS));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const timestamp = parseDay(row.day);
    const count = Number(row.count);
    if (timestamp === null || row.day > today || !Number.isSafeInteger(count) || count < 1) continue;
    counts.set(row.day, (counts.get(row.day) ?? 0) + count);
  }

  const days: ActivityDay[] = Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, index) => {
    const date = addDays(startDate,index);
    const count = counts.get(date) ?? 0;
    return { date, count, level: activityLevel(count) };
  });
  const recent = days.reduce((summary,day)=>({totalAnalyses:summary.totalAnalyses+day.count,activeDays:summary.activeDays+(day.count>0?1:0)}),{totalAnalyses:0,activeDays:0});

  const activeDates = [...counts.keys()].sort();
  let longestStreak = 0, run = 0, previous: string | null = null;
  for (const date of activeDates) {
    run = previous && addDays(previous,1)===date ? run+1 : 1;
    longestStreak = Math.max(longestStreak,run);
    previous = date;
  }

  let streakEnd = today;
  if (!counts.has(today)) streakEnd = addDays(today,-1);
  let currentStreak = 0;
  if (counts.has(streakEnd)) {
    let cursor = streakEnd;
    while (counts.has(cursor)) { currentStreak++; cursor=addDays(cursor,-1); }
  }

  return { timeZone:ACTIVITY_TIME_ZONE,startDate,endDate:today,...recent,currentStreak,longestStreak,days };
}

/** One indexed, per-user daily aggregate. No source, report, or finding content is selected. */
export async function readCodingActivity(userId: string, now = new Date()): Promise<CodingActivity> {
  const rows = await prisma.$queryRaw<DailyActivityInput[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
           COUNT(*)::bigint AS count
    FROM "AnalysisRun"
    WHERE "userId" = ${userId}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return buildCodingActivity(rows,now);
}
