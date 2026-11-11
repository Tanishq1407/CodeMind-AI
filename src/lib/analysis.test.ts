import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisServiceError, runAnalysis } from "@/lib/analysis";

const serviceReport = {
  language: "Python",
  analysis_method: "AST",
  metrics: { lines_of_code: 2, total_lines: 2, functions: 0, classes: 0, loops: 0, conditionals: 0, approx_complexity: 0 },
  structure: { functions: 0, classes: 0, loops: 0, conditionals: 0, approx_complexity: 0 },
  findings: [{ title: "Unused variable `x`", severity: "Low", message: "`x` is never read.", line: 1, line_end: 1, category: "Maintainability", suggestion: "Remove it.", suggested_code: "print('ok')" }],
  recommendations: ["Remove unused local variables."],
  quality_score: 97,
  score_explanation: { starting_score: 100, penalties: { Low: 1 } },
  limitations: "Static checks only.",
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("static analysis dispatch and Python service integration", () => {
  it("uses the explicitly labeled local lexical fallback in development when no service URL is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANALYSIS_SERVICE_URL", "");
    const result = await runAnalysis("eval(value)", "Python");
    expect(result.analysis_method).toContain("lexical");
    expect(result.findings[0].severity).toBe("High");
    expect(result.quality_score).toBe(85);
  });

  it("requires production service configuration instead of silently using lexical fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANALYSIS_SERVICE_URL", "");
    await expect(runAnalysis("print('ok')", "Python")).rejects.toMatchObject({
      name: "AnalysisServiceError", kind: "configuration",
      message: expect.stringContaining("ANALYSIS_SERVICE_URL"),
    });
  });

  it("posts authenticated Python code and validates the structured response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test/");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "server-only-test-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(serviceReport), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAnalysis("x = 1\nprint('ok')", "Python");
    expect(result).toMatchObject({ language: "Python", analysis_method: "AST", findings: [{ line: 1, line_end: 1 }] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://analysis.example.test/analyze");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", "x-codemind-service-token": "server-only-test-token" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ source: "x = 1\nprint('ok')", language: "Python" });
  });

  it("rejects an absent service token without making a network request", async () => {
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(runAnalysis("print('ok')", "Python")).rejects.toMatchObject({ kind: "configuration" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-HTTPS production URLs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "token");
    vi.stubEnv("ANALYSIS_SERVICE_URL", "not a URL");
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "configuration" });
    vi.stubEnv("ANALYSIS_SERVICE_URL", "http://analysis.example.test");
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "configuration", message: expect.stringContaining("HTTPS") });
  });

  it("classifies a failed connection and timeout without exposing low-level details", async () => {
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("private host detail")));
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "unavailable", message: expect.not.stringContaining("private host detail") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout internals", "TimeoutError")));
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "timeout", message: expect.not.stringContaining("timeout internals") });
  });

  it("identifies a shared-token mismatch without returning the service response body", async () => {
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret upstream body", { status: 401 })));
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "configuration", message: expect.not.stringContaining("secret upstream body") });
  });

  it("rejects malformed or mismatched Python-service reports", async () => {
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "invalid_response" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...serviceReport, language: "C++" }), { status: 200 })));
    await expect(runAnalysis("x = 1", "Python")).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("rejects oversized source before sending it to the service", async () => {
    vi.stubEnv("ANALYSIS_SERVICE_URL", "https://analysis.example.test");
    vi.stubEnv("ANALYSIS_SERVICE_TOKEN", "token");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(runAnalysis("x".repeat(100_001), "Python")).rejects.toThrow("100 KB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Acorn for JavaScript and detects dynamic evaluation", async () => {
    const result = await runAnalysis("function f(x) { return eval(x); }", "JavaScript");
    expect(result.analysis_method).toContain("Acorn");
    expect(result.findings.some(finding => finding.title === "Dynamic code execution")).toBe(true);
  });

  it("treats normal Java and JavaScript console output as program behavior", async () => {
    const java = await runAnalysis("class Example { void run() { System.out.println(\"ok\"); } }", "Java");
    const js = await runAnalysis("console.log('ok');", "JavaScript");
    expect(java.findings).toEqual([]);
    expect(js.findings).toEqual([]);
  });

  it("parses Java and estimates structural complexity", async () => {
    const result = await runAnalysis("class Example { void run() { if (true) { System.out.println(\"ok\"); } } }", "Java");
    expect(result.analysis_method).toContain("Java grammar");
    expect(result.metrics.classes).toBeGreaterThan(0);
  });

  it("rejects unsupported languages and oversized source", async () => {
    await expect(runAnalysis("x", "Rust")).rejects.toThrow("Python, C++, Java");
    await expect(runAnalysis("x".repeat(100_001), "JavaScript")).rejects.toThrow("100 KB");
  });
});
