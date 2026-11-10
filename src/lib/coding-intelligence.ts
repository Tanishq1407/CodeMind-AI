export type IntelligenceAnalysis = {
  id: string;
  score: number;
  language: string;
  createdAt: Date;
  findings: { title: string; severity: string; message: string; line: number | null }[];
};

export function findingCategory(title: string, message = "") {
  const text = `${title} ${message}`.toLowerCase();
  if (/syntax|undefined|unbound|uninitialized|empty catch|exception|error handling/.test(text)) return "Correctness";
  if (/eval|exec|injection|unsafe|process execution|security|gets\(|strcpy/.test(text)) return "Security";
  if (/complexity|nested loop|quadratic|performance|inefficient|allocation/.test(text)) return "Performance";
  if (/parameter|module|duplicate|readability|maintain|todo|fixme|console|print|debugger|unused variable/.test(text)) return "Maintainability";
  return "Code quality";
}

export function recommendedCorrection(title: string, storedSuggestion?: string | null) {
  if (storedSuggestion) return storedSuggestion;
  const text = title.toLowerCase();
  if (/syntax error/.test(text)) return "Resolve the parser error at the reported line, then rerun analysis.";
  if (/eval|dynamic code/.test(text)) return "Use a format-specific data parser instead of evaluating input as source code.";
  if (/process execution/.test(text)) return "Allowlist the executable and arguments, avoid shell interpretation, and constrain the process permissions.";
  if (/empty catch/.test(text)) return "Handle the expected error explicitly, rethrow it, or document why it is intentionally ignored.";
  if (/nested loop/.test(text)) return "If the inner loop repeats a lookup or membership test, precompute a set or map when behavior allows. Keep nested iteration when every pair is required.";
  if (/many function parameters/.test(text)) return "Group cohesive options into a named object, or split responsibilities if the parameters serve unrelated operations.";
  if (/unused variable/.test(text)) return "Remove the unused assignment or use the value. If the right-hand side is intentionally evaluated for side effects, make that intent explicit.";
  if (/debugger|console|print|standard output/.test(text)) return "Remove temporary output, or route intentional diagnostics through the application's logging mechanism.";
  if (/manual allocation/.test(text)) return "Review ownership and lifetime; prefer an RAII container or smart pointer when it matches the required ownership.";
  if (/unsafe gets/.test(text)) return "Replace gets() with a bounded input routine and validate the accepted length.";
  if (/strcpy/.test(text)) return "Use a length-aware copy strategy and verify destination capacity before copying.";
  if (/global std namespace/.test(text)) return "Use qualified std:: names or a narrower declaration at the smallest relevant scope.";
  if (/many function parameters/.test(text)) return "Group cohesive options into a named object, or split responsibilities if parameters serve unrelated operations.";
  if (/unresolved todo|fixme/.test(text)) return "Resolve the marked work or convert it into a tracked task with explicit ownership before release.";
  return "Review the code in its local context, apply a change that addresses the described observation, and validate it with project tests.";
}

export function buildCodingIntelligence(analyses: IntelligenceAnalysis[]) {
  const ascending = [...analyses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const titleCounts = new Map<string, { title: string; count: number; examples: { id: string; date: Date; line: number | null; severity: string }[] }>();
  const categoryCounts = new Map<string, number>();
  for (const analysis of ascending) for (const finding of analysis.findings) {
    const title = finding.title.trim();
    const item = titleCounts.get(title) ?? { title, count: 0, examples: [] };
    item.count++;
    if (item.examples.length < 5) item.examples.push({ id: analysis.id, date: analysis.createdAt, line: finding.line, severity: finding.severity });
    else { item.examples.shift(); item.examples.push({ id: analysis.id, date: analysis.createdAt, line: finding.line, severity: finding.severity }); }
    titleCounts.set(title, item);
    const category = findingCategory(finding.title, finding.message);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const recurring = [...titleCounts.values()].filter(x => x.count > 1).sort((a,b) => b.count-a.count || a.title.localeCompare(b.title));
  const categories = [...categoryCounts.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  const scoreTrend = ascending.length >= 10 ? (() => {
    const previous = ascending.slice(-10, -5), recent = ascending.slice(-5);
    const average = (items: IntelligenceAnalysis[]) => items.reduce((sum,x)=>sum+x.score,0)/items.length;
    return { previous: average(previous), recent: average(recent), delta: average(recent)-average(previous), previousCount: previous.length, recentCount: recent.length };
  })() : null;
  const focusMap: Record<string, { topic: string; practice: string }> = {
    Correctness: { topic: "Control flow and error handling", practice: "Review how each error path is handled, then add a test for the failure case." },
    Security: { topic: "Safe input handling", practice: "Trace untrusted inputs to sensitive operations and replace dynamic or unbounded operations where possible." },
    Performance: { topic: "Algorithmic complexity", practice: "For each repeated operation, estimate its cost as input grows and look for reusable indexes or data structures." },
    Maintainability: { topic: "Small, focused functions", practice: "Refactor one repeated or overly broad pattern into a focused helper, then compare readability and test coverage." },
    "Code quality": { topic: "Consistent code review", practice: "Review the cited findings in context and add a small test or lint rule for a repeated pattern." },
  };
  const focus = categories.slice(0,3).map(({name,count})=>({ ...focusMap[name], category:name, evidenceCount:count }));
  return { analysisCount: ascending.length, recurring, categories, focus, scoreTrend };
}
