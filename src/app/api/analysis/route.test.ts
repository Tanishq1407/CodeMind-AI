import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, analysisMock, rateLimitMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(), analysisMock: vi.fn(), rateLimitMock: vi.fn(),
  prismaMock: {
    usageRecord: { count: vi.fn(), create: vi.fn() },
    project: { findFirst: vi.fn() },
    analysisRun: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/analysis", () => ({
  runAnalysis: analysisMock,
  AnalysisServiceError: class extends Error {
    constructor(readonly kind: string, message: string) { super(message); this.name = "AnalysisServiceError"; }
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: rateLimitMock,
  sameOrigin: vi.fn(() => true),
  readJsonBounded: (request: Request) => request.json(),
}));

import { AnalysisServiceError } from "@/lib/analysis";
import { POST } from "./route";

const report = {
  language: "Python", analysis_method: "AST", metrics: { lines_of_code: 1 }, structure: {},
  findings: [{ title: "Unused variable `x`", severity: "Low", message: "Unused in this scope.", line: 1, line_end: 1, category: "Maintainability", suggestion: "Remove it.", suggested_code: "print('ok')" }],
  recommendations: ["Remove unused locals."], quality_score: 97,
  score_explanation: { starting_score: 100 }, limitations: "Static analysis only.",
};

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://codemindai.site/api/analysis", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://codemindai.site" }, body: JSON.stringify(body),
  });
}

describe("POST /api/analysis service errors and ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-a" } });
    rateLimitMock.mockResolvedValue(true);
    prismaMock.usageRecord.count.mockResolvedValue(0);
    prismaMock.project.findFirst.mockResolvedValue({ id: "project-a" });
    prismaMock.analysisRun.create.mockResolvedValue({ id: "analysis-a" });
    prismaMock.$transaction.mockResolvedValue([{ id: "analysis-a" }, {}]);
    analysisMock.mockResolvedValue(report);
  });
  afterEach(() => vi.restoreAllMocks());

  it("requires authentication before querying or calling the analyzer", async () => {
    authMock.mockResolvedValue(null);
    const response = await POST(makeRequest({ source: "x = 1", language: "Python" }));
    expect(response.status).toBe(401);
    expect(analysisMock).not.toHaveBeenCalled();
    expect(prismaMock.analysisRun.create).not.toHaveBeenCalled();
  });

  it("scopes project access to the authenticated user", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    const response = await POST(makeRequest({ source: "x = 1", language: "Python", projectId: "project-b" }));
    expect(response.status).toBe(404);
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({ where: { id: "project-b", userId: "user-a" }, select: { id: true } });
    expect(analysisMock).not.toHaveBeenCalled();
  });

  it("persists line range and corrected source only under the authenticated account", async () => {
    const response = await POST(makeRequest({ source: "x = 1", language: "Python", sourceName: "sample.py" }));
    expect(response.status).toBe(200);
    const createCall = prismaMock.analysisRun.create.mock.calls[0][0];
    expect(createCall.data.userId).toBe("user-a");
    expect(createCall.data.findings.create[0]).toMatchObject({ line: 1, lineEnd: 1, suggestedCode: "print('ok')" });
  });

  it("returns a safe actionable service error and logs only stage and error type", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    analysisMock.mockRejectedValue(new AnalysisServiceError("unavailable", "Python analysis service could not be reached."));
    const response = await POST(makeRequest({ source: "private source", language: "Python" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Python analysis service could not be reached." });
    expect(log).toHaveBeenCalledWith("[analysis] request failed", { stage: "analysis_service", errorKind: "unavailable", errorName: "AnalysisServiceError" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("private source");
    expect(log.mock.calls.flat().join(" ")).not.toContain("ANALYSIS_SERVICE_TOKEN");
  });

  it("distinguishes database persistence failures from analyzer failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.$transaction.mockRejectedValue(new Error("database connection secret"));
    const response = await POST(makeRequest({ source: "x = 1", language: "Python" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The analysis completed, but its report could not be saved. Please retry." });
    expect(log).toHaveBeenCalledWith("[analysis] request failed", { stage: "database_save", errorKind: "internal", errorName: "Error" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("database connection secret");
  });
});
