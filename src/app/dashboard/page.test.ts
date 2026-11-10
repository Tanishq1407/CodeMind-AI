import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    analysisRun: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    analysisFinding: { count: vi.fn() },
    usageRecord: { count: vi.fn() },
    project: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ActivityHeatmap } from "@/components/activity-heatmap";
import Dashboard from "./page";

describe("authenticated dashboard activity placement", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "current-user", name: "Ada" } });
    prismaMock.analysisRun.count.mockResolvedValue(0);
    prismaMock.analysisRun.aggregate.mockResolvedValue({ _avg: { score: null } });
    prismaMock.analysisFinding.count.mockResolvedValue(0);
    prismaMock.analysisRun.findMany.mockResolvedValue([]);
    prismaMock.analysisRun.groupBy.mockResolvedValue([]);
    prismaMock.usageRecord.count.mockResolvedValue(0);
    prismaMock.project.count.mockResolvedValue(0);
  });

  it("renders the authenticated heatmap after metrics and before recent analyses", async () => {
    const page = await Dashboard();
    const children = page.props.children as React.ReactElement[];
    expect(children[2].type).toBe(ActivityHeatmap);
    const recentSection = (children[4].props as { children: React.ReactElement[] }).children[0];
    const recentHeading = (recentSection.props as { children: React.ReactElement[] }).children[0];
    expect((recentHeading.props as { children: string }).children).toBe("Recent analyses");
  });
});
