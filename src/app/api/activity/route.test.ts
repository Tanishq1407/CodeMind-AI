import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, queryMock, rateLimitMock } = vi.hoisted(()=>({authMock:vi.fn(),queryMock:vi.fn(),rateLimitMock:vi.fn()}));
vi.mock("@/lib/auth",()=>({auth:authMock}));
vi.mock("@/lib/prisma",()=>({prisma:{$queryRaw:queryMock}}));
vi.mock("@/lib/rate-limit",()=>({consumeRateLimit:rateLimitMock}));

import { GET } from "./route";

describe("GET /api/activity",()=>{
  beforeEach(()=>{vi.clearAllMocks();rateLimitMock.mockResolvedValue(true);});

  it("requires authentication and does not query data for an anonymous caller",async()=>{
    authMock.mockResolvedValue(null);
    const response=await GET();
    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("aggregates only the authenticated user's daily dates and returns no code content",async()=>{
    authMock.mockResolvedValue({user:{id:"user-owned-1"}});
    queryMock.mockResolvedValue([{day:"2026-11-10",count:BigInt(4)}]);
    const response=await GET();
    const payload=await response.json();
    const [sql, ...parameters]=queryMock.mock.calls[0] as [TemplateStringsArray,...unknown[]];
    expect(response.status).toBe(200);
    expect(sql.join("?")).toContain('FROM "AnalysisRun"');
    expect(sql.join("?")).toContain('WHERE "userId" = ?');
    expect(parameters).toContain("user-owned-1");
    expect(payload.totalAnalyses).toBe(4);
    expect(payload.days).toHaveLength(365);
    expect(JSON.stringify(payload)).not.toMatch(/sourceCode|findings|private code/i);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a safe error if activity storage is unavailable",async()=>{
    authMock.mockResolvedValue({user:{id:"user-owned-2"}});
    queryMock.mockRejectedValue(new Error("private database detail"));
    const response=await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:"Coding activity is temporarily unavailable."});
  });
});
