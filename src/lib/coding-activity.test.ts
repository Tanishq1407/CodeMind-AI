import { describe, expect, it } from "vitest";
import { activityLevel, buildCodingActivity, utcDay } from "./coding-activity";

const fixedNow=new Date("2026-11-10T18:00:00.000Z");

describe("coding activity aggregation",()=>{
  it("returns an honest zero-activity 365-day window",()=>{
    const result=buildCodingActivity([],fixedNow);
    expect(result.totalAnalyses).toBe(0);expect(result.activeDays).toBe(0);
    expect(result.currentStreak).toBe(0);expect(result.longestStreak).toBe(0);
    expect(result.days).toHaveLength(365);expect(result.days.every(day=>day.count===0&&day.level===0)).toBe(true);
    expect(result.startDate).toBe("2025-11-11");expect(result.endDate).toBe("2026-11-10");
  });

  it("counts one completed analysis as one active day and a one-day streak",()=>{
    const result=buildCodingActivity([{day:"2026-11-10",count:1}],fixedNow);
    expect(result.totalAnalyses).toBe(1);expect(result.activeDays).toBe(1);
    expect(result.currentStreak).toBe(1);expect(result.longestStreak).toBe(1);
    expect(result.days.at(-1)).toMatchObject({date:"2026-11-10",count:1,level:1});
  });

  it("counts multiple same-day analyses separately but counts one active day",()=>{
    const result=buildCodingActivity([{day:"2026-11-10",count:2},{day:"2026-11-10",count:3}],fixedNow);
    expect(result.totalAnalyses).toBe(5);expect(result.activeDays).toBe(1);
    expect(result.currentStreak).toBe(1);expect(result.longestStreak).toBe(1);
    expect(result.days.at(-1)).toMatchObject({date:"2026-11-10",count:5,level:3});
  });

  it("calculates a streak ending today and a broken streak's historical maximum",()=>{
    const rows=["2026-11-07","2026-11-08","2026-11-09","2026-11-10","2026-11-12"].map(day=>({day,count:1}));
    const result=buildCodingActivity(rows,fixedNow);
    expect(result.currentStreak).toBe(4);expect(result.longestStreak).toBe(4);
    expect(result.totalAnalyses).toBe(4);
  });

  it("keeps the current streak valid when the latest activity was yesterday",()=>{
    const result=buildCodingActivity([{day:"2026-11-07",count:1},{day:"2026-11-08",count:1},{day:"2026-11-09",count:1}],fixedNow);
    expect(result.currentStreak).toBe(3);expect(result.longestStreak).toBe(3);
  });

  it("breaks the current streak after two inactive days without losing the record",()=>{
    const result=buildCodingActivity([{day:"2026-11-01",count:1},{day:"2026-11-02",count:1},{day:"2026-11-03",count:1},{day:"2026-11-08",count:2}],fixedNow);
    expect(result.currentStreak).toBe(0);expect(result.longestStreak).toBe(3);
  });

  it("handles month, year, and leap-day boundaries as consecutive UTC dates",()=>{
    const result=buildCodingActivity([
      {day:"2024-02-28",count:1},{day:"2024-02-29",count:1},{day:"2024-03-01",count:1},
      {day:"2024-12-31",count:1},{day:"2025-01-01",count:1},
    ],fixedNow);
    expect(result.longestStreak).toBe(3);
  });

  it("uses UTC consistently across local timezone offsets",()=>{
    const now=new Date("2026-01-01T00:15:00+14:00");
    expect(utcDay(now)).toBe("2025-12-31");
    const result=buildCodingActivity([{day:"2025-12-31",count:1}],now);
    expect(result.endDate).toBe("2025-12-31");expect(result.currentStreak).toBe(1);
  });

  it("assigns stable activity intensity thresholds",()=>{
    expect([0,1,2,3,4,6,7,20].map(activityLevel)).toEqual([0,1,2,2,3,3,4,4]);
  });

  it("does not include activity before the rolling 365-day window or future dates",()=>{
    const result=buildCodingActivity([
      {day:"2025-11-10",count:4},{day:"2025-11-11",count:2},{day:"2026-11-11",count:9},
    ],fixedNow);
    expect(result.totalAnalyses).toBe(2);expect(result.activeDays).toBe(1);
    expect(result.days[0]).toMatchObject({date:"2025-11-11",count:2});
    expect(result.longestStreak).toBe(2); // The pre-window day still belongs to the all-time record.
  });
});
