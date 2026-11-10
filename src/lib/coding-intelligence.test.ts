import { describe, expect, it } from "vitest";
import { buildCodingIntelligence, findingCategory, recommendedCorrection } from "./coding-intelligence";

describe("coding intelligence", () => {
  it("reports only recurring findings and categorizes observed patterns", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const data = buildCodingIntelligence([
      { id: "a", score: 80, language: "Python", createdAt: now, findings: [{ title: "Nested loop", severity: "MEDIUM", message: "Potential performance concern", line: 4 }] },
      { id: "b", score: 82, language: "JavaScript", createdAt: new Date(now.getTime()+1000), findings: [{ title: "Nested loop", severity: "MEDIUM", message: "Potential performance concern", line: 8 }] },
    ]);
    expect(data.analysisCount).toBe(2);
    expect(data.recurring[0]?.count).toBe(2);
    expect(findingCategory("Nested loop", "Potential performance concern")).toBe("Performance");
    expect(recommendedCorrection("Nested loop")).toContain("set or map");
    expect(data.scoreTrend).toBeNull();
  });

  it("compares only the last two complete groups of five analyses", () => {
    const analyses = Array.from({ length: 10 }, (_, index) => ({
      id: String(index), score: index < 5 ? 60 : 80, language: "Python",
      createdAt: new Date(2026, 0, index+1), findings: [],
    }));
    const data = buildCodingIntelligence(analyses);
    expect(data.scoreTrend?.previous).toBe(60);
    expect(data.scoreTrend?.recent).toBe(80);
    expect(data.scoreTrend?.delta).toBe(20);
  });
});
