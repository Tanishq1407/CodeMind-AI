import {describe,it,expect} from "vitest";import {runAnalysis} from "@/lib/analysis";
describe("static analysis dispatch",()=>{
 it("marks the Python fallback as lexical and detects eval",async()=>{const r=await runAnalysis("eval(value)","Python");expect(r.analysis_method).toContain("lexical");expect(r.findings[0].severity).toBe("High");expect(r.quality_score).toBe(85);});
 it("rejects oversized code",async()=>{await expect(runAnalysis("x".repeat(100001),"Python")).rejects.toThrow("100 KB");});
 it("uses Acorn syntax trees for JavaScript and detects dynamic evaluation",async()=>{const r=await runAnalysis("function f(x) { return eval(x); }","JavaScript");expect(r.analysis_method).toContain("Acorn");expect(r.findings.some(f=>f.title==="Dynamic code execution")).toBe(true);});
 it("parses Java and estimates structural complexity",async()=>{const r=await runAnalysis("class Example { void run() { if (true) { System.out.println(\"ok\"); } } }","Java");expect(r.analysis_method).toContain("Java grammar");expect(r.metrics.classes).toBeGreaterThan(0);expect(r.findings.some(f=>f.title==="Standard output call")).toBe(true);});
 it("rejects unsupported languages",async()=>{await expect(runAnalysis("x","Rust")).rejects.toThrow("Python, C++");});
});
