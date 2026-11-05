export type Finding = { title: string; severity: "High" | "Medium" | "Low" | "Info"; message: string; line?: number | null };
export type Analysis = { language: string; analysis_method: string; metrics: Record<string, number>; structure: Record<string, number>; findings: Finding[]; recommendations: string[]; quality_score: number; score_explanation: Record<string, unknown>; limitations: string };
const maxBytes = 100_000;
export async function runAnalysis(source: string, language: string): Promise<Analysis> {
  if (new TextEncoder().encode(source).length > maxBytes) throw new Error("Source is larger than the 100 KB limit.");
  if (!(["Python", "C++"] as string[]).includes(language)) throw new Error("Currently available analysis: Python and C++.");
  const base = process.env.ANALYSIS_SERVICE_URL;
  if (base) {
    const response = await fetch(`${base.replace(/\/$/, "")}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, language }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error("Analysis service returned an error.");
    return await response.json() as Analysis;
  }
  // Offline fallback is deliberately conservative and labeled as lexical analysis.
  const lines = source.split(/\r?\n/), findings: Finding[] = [];
  if (language === "Python") {
    lines.forEach((line, index) => { if (/\beval\s*\(|\bexec\s*\(/.test(line)) findings.push({ title: "Dynamic code execution", severity: "High", message: "eval/exec can execute arbitrary input. Avoid them or restrict inputs to trusted data.", line: index + 1 }); if (/\bprint\s*\(/.test(line)) findings.push({ title: "Debug or console output", severity: "Low", message: "Review print() calls and use deliberate logging or UI output.", line: index + 1 }); });
  } else {
    const checks = [[/\bgets\s*\(/i,"Unsafe gets() usage","High","gets() does not limit input length."],[/\bstrcpy\s*\(/i,"Unbounded strcpy() usage","High","Review buffer bounds and prefer safer ownership-aware interfaces."],[/\bnew\s+\w+/,"Manual allocation","Medium","Review ownership; RAII types are often safer."],[/\bTODO\b|\bFIXME\b/i,"Unresolved TODO/FIXME","Low","Review this marker before release."] ] as const;
    lines.forEach((line,index)=>checks.forEach(([re,title,severity,message])=>{if(re.test(line)) findings.push({title,severity,message,line:index+1});}));
  }
  const weights = { High: 15, Medium: 7, Low: 3, Info: 0 }, score = Math.max(0,100-findings.reduce((sum,f)=>sum+weights[f.severity],0));
  const loc = lines.filter(x=>x.trim()).length;
  return { language, analysis_method: "Limited lexical fallback", metrics: { lines_of_code: loc, total_lines: lines.length }, structure: {}, findings, recommendations: ["Lexical checks may miss issues or flag code that is safe in context.", "Use a language-specific analyzer and review changes before relying on them."], quality_score: score, score_explanation: { starting_score:100, weight_by_severity:weights, formula:"max(0, 100 - severity weights)" }, limitations: "Fallback mode only checks a small set of text patterns. It does not parse code and does not establish correctness, security, or quality." };
}
