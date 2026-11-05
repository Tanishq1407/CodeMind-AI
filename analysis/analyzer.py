"""Static-only Python AST analysis and approximate C++ lexical checks."""
from __future__ import annotations
import ast
import re
from collections import Counter

def _issue(title: str, severity: str, message: str, line: int | None = None) -> dict:
    return {"title": title, "severity": severity, "message": message, "line": line}

def _score(findings: list[dict]) -> tuple[int, dict]:
    weights = {"High": 15, "Medium": 7, "Low": 3}
    score = max(0, 100 - sum(weights.get(f["severity"], 0) for f in findings))
    return score, {"starting_score": 100, "penalties": dict(Counter(f["severity"] for f in findings)),
                   "weight_by_severity": weights, "total_penalty": 100-score,
                   "formula": "max(0, 100 - sum(severity weights for detected findings))"}

def _line_metrics(source: str, language: str) -> dict:
    lines = source.splitlines()
    blank = sum(not line.strip() for line in lines)
    if language == "Python":
        comments = sum(line.lstrip().startswith("#") for line in lines)
    else:
        comments = sum(line.lstrip().startswith(("//", "*", "/*")) for line in lines)
    return {"lines_of_code": sum(bool(line.strip()) for line in lines), "blank_lines": blank,
            "comment_lines": comments, "total_lines": len(lines)}

class _PythonVisitor(ast.NodeVisitor):
    def __init__(self):
        self.functions = self.classes = self.loops = self.conditionals = self.complexity = 0
        self.findings = []
    def visit_FunctionDef(self, node):
        self.functions += 1; self.complexity += 1
        if len(node.args.args) > 6:
            self.findings.append(_issue("Many function parameters", "Low", f"'{node.name}' has {len(node.args.args)} parameters; consider grouping related values.", node.lineno))
        self.generic_visit(node)
    visit_AsyncFunctionDef = visit_FunctionDef
    def visit_ClassDef(self, node):
        self.classes += 1; self.generic_visit(node)
    def visit_For(self, node):
        self.loops += 1; self.complexity += 1; self.generic_visit(node)
    visit_AsyncFor = visit_For
    def visit_While(self, node):
        self.loops += 1; self.complexity += 1; self.generic_visit(node)
    def visit_If(self, node):
        self.conditionals += 1; self.complexity += 1; self.generic_visit(node)
    def visit_IfExp(self, node):
        self.complexity += 1; self.generic_visit(node)
    def visit_BoolOp(self, node):
        self.complexity += max(0, len(node.values)-1); self.generic_visit(node)
    def visit_Try(self, node):
        self.complexity += len(node.handlers); self.generic_visit(node)
    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id == "print":
            self.findings.append(_issue("Debug or console output", "Low", "Review print() calls and use deliberate logging or UI output.", node.lineno))
        if isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}:
            self.findings.append(_issue("Dynamic code execution", "High", "eval/exec can execute arbitrary input. Avoid them or constrain the design to trusted data.", node.lineno))
        self.generic_visit(node)

def _report(language, metrics, structure, findings, recommendations, method):
    score, explanation = _score(findings)
    return {"language": language, "analysis_method": method, "metrics": metrics, "structure": structure,
            "findings": findings, "recommendations": recommendations, "quality_score": score,
            "score_explanation": explanation,
            "limitations": "Static checks only. A high score does not prove correctness, security, or optimality."}

def analyze_python(source: str) -> dict:
    metrics = _line_metrics(source, "Python")
    if not source.strip():
        return _report("Python", metrics, {}, [], ["Paste or upload Python source to begin analysis."], "AST")
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        issue = _issue("Python syntax error", "High", exc.msg, exc.lineno)
        return _report("Python", metrics, {}, [issue], ["Fix the syntax error, then analyze again."], "AST")
    visitor = _PythonVisitor(); visitor.visit(tree)
    metrics.update({"functions": visitor.functions, "classes": visitor.classes, "loops": visitor.loops,
                    "conditionals": visitor.conditionals, "approx_complexity": visitor.complexity})
    findings = visitor.findings
    if not visitor.functions and metrics["lines_of_code"] > 20:
        findings.append(_issue("Large module without functions", "Low", "Consider splitting the module into focused functions or classes."))
    recommendations = ["Keep functions focused and add tests around important behavior."]
    if any(f["title"] == "Dynamic code execution" for f in findings):
        recommendations.insert(0, "Remove eval/exec where possible; parse data with a safe format-specific parser.")
    if not findings:
        recommendations.insert(0, "No configured quality heuristics were triggered; this does not prove the code is correct or secure.")
    structure = {k: metrics[k] for k in ("functions", "classes", "loops", "conditionals", "approx_complexity")}
    return _report("Python", metrics, structure, findings, recommendations, "AST")

def analyze_cpp(source: str) -> dict:
    metrics = _line_metrics(source, "C++")
    if not source.strip():
        return _report("C++", metrics, {}, [], ["Paste or upload C++ source to begin analysis."], "Approximate lexical heuristics")
    findings = []
    checks = [(r"\bgets\s*\(", "Unsafe gets() usage", "High", "gets() does not limit input length; use a bounded input method."),
              (r"\bstrcpy\s*\(", "Unbounded strcpy() usage", "High", "Prefer a bounded operation and validate buffer sizes."),
              (r"\busing\s+namespace\s+std\s*;", "Global std namespace import", "Low", "Prefer qualified std:: names or a narrower using declaration."),
              (r"\b(?:TODO|FIXME)\b", "Unresolved TODO/FIXME", "Low", "Review this marker before considering the work complete."),
              (r"\bnew\s+\w+", "Manual allocation", "Medium", "Review ownership; prefer RAII types such as std::vector or std::unique_ptr."),
              (r"\bwhile\s*\(\s*true\s*\)", "Potential unbounded loop", "Medium", "Confirm there is a clear exit path for this loop.")]
    for pattern, title, severity, message in checks:
        for match in re.finditer(pattern, source, re.IGNORECASE):
            findings.append(_issue(title, severity, message, source.count("\n", 0, match.start())+1))
    # Lexical estimates only; macros, templates, and comments can affect these counts.
    metrics.update({"functions_estimate": len(re.findall(r"\b\w[\w:<>*&\s]*\s+\w+\s*\([^;{}]*\)\s*\{", source)),
                    "classes_estimate": len(re.findall(r"\bclass\s+\w+", source)),
                    "loops_estimate": len(re.findall(r"\b(for|while|do)\b", source)),
                    "conditionals_estimate": len(re.findall(r"\b(if|switch)\b", source)),
                    "approx_complexity_estimate": 1+len(re.findall(r"\b(if|for|while|case|catch)\b|&&|\|\|", source))})
    estimates = {k:v for k,v in metrics.items() if k.endswith("_estimate")}
    recommendations = ["Treat counts as lexical estimates; macros, templates, comments, and formatting can affect them.",
                       "Review ownership, input validation, and error handling in context."]
    if not findings:
        recommendations.insert(0, "No configured heuristic was triggered; this does not establish correctness or security.")
    return _report("C++", metrics, estimates, findings, recommendations, "Approximate lexical heuristics")

def analyze(source: str, language: str) -> dict:
    if language == "Python": return analyze_python(source)
    if language == "C++": return analyze_cpp(source)
    raise ValueError("Language must be Python or C++.")
