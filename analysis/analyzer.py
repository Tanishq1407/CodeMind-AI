"""Static-only Python AST analysis and approximate C++ lexical checks."""
from __future__ import annotations
import ast
import re
import symtable
from collections import Counter

def _issue(title: str, severity: str, message: str, line: int | None = None,
           category: str = "Maintainability", suggestion: str | None = None,
           line_end: int | None = None, suggested_code: str | None = None) -> dict:
    return {"title": title, "severity": severity, "message": message, "line": line,
            "line_end": line_end if line_end is not None else line,
            "category": category, "suggestion": suggestion,
            "suggested_code": suggested_code}

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

class _BindingLocations(ast.NodeVisitor):
    """Collect bindings in one lexical scope, without entering child scopes."""
    def __init__(self, root):
        self.root = root
        self.bindings: dict[str, tuple[int, str]] = {}
    def visit_FunctionDef(self, node):
        if node is self.root:
            for statement in node.body: self.visit(statement)
    visit_AsyncFunctionDef = visit_FunctionDef
    def visit_ClassDef(self, node):
        if node is self.root:
            for statement in node.body: self.visit(statement)
    def visit_Lambda(self, node): return
    def visit_ListComp(self, node): return
    visit_SetComp = visit_ListComp
    visit_DictComp = visit_ListComp
    visit_GeneratorExp = visit_ListComp
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store) and node.id != "_":
            # The full source line is more useful than the bare identifier.
            segment = getattr(self, "source_lines", [])
            text = segment[node.lineno - 1].strip() if len(segment) >= node.lineno else node.id
            self.bindings.setdefault(node.id, (node.lineno, text))
    def visit_Import(self, node):
        for alias in node.names:
            name = alias.asname or alias.name.split(".")[0]
            self.bindings.setdefault(name, (node.lineno, f"import {alias.name}" + (f" as {alias.asname}" if alias.asname else "")))
    def visit_ImportFrom(self, node):
        if node.module == "__future__": return
        for alias in node.names:
            if alias.name == "*": continue
            name = alias.asname or alias.name
            self.bindings.setdefault(name, (node.lineno, f"from {node.module or '.'} import {alias.name}" + (f" as {alias.asname}" if alias.asname else "")))


def _scope_is_dynamic(node: ast.AST) -> bool:
    class DynamicUse(ast.NodeVisitor):
        found = False
        def visit_FunctionDef(self, child):
            if child is node:
                for statement in child.body: self.visit(statement)
        visit_AsyncFunctionDef = visit_FunctionDef
        def visit_Lambda(self, child): return
        def visit_ClassDef(self, child): return
        def visit_Call(self, child):
            if isinstance(child.func, ast.Name) and child.func.id in {"eval", "exec", "locals", "globals", "vars"}:
                self.found = True
            self.generic_visit(child)
    visitor = DynamicUse(); visitor.visit(node)
    return visitor.found


def _code_without_line(source: str, line: int) -> str | None:
    lines = source.splitlines()
    if len(lines) > 30 or len(source) > 4_000 or not 1 <= line <= len(lines) or ";" in lines[line - 1]:
        return None
    candidate = "\n".join(lines[:line - 1] + lines[line:])
    try: ast.parse(candidate)
    except SyntaxError: return None
    return candidate or None


def _unused_bindings(tree: ast.Module, source: str) -> list[dict]:
    """Report names not read in their lexical scope; skip dynamic namespaces."""
    root_table = symtable.symtable(source, "<analysis>", "exec")
    nodes = {("top", 0): tree}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            nodes[(node.name, node.lineno)] = node
    results = []

    def visit_table(table):
        node = nodes.get((table.get_name(), table.get_lineno()))
        if table.get_type() != "module" and node is None:
            for child in table.get_children(): visit_table(child)
            return
        if table.get_type() in {"module", "function"} and node is not None and not _scope_is_dynamic(node):
            locations = _BindingLocations(node); locations.source_lines = source.splitlines(); locations.visit(node)
            symbols = {symbol.get_name(): symbol for symbol in table.get_symbols()}
            # A closure or nested global reference counts as a read of the bound name.
            descendant_reads: set[str] = set()
            def find_descendant_reads(parent):
                for child in parent.get_children():
                    for symbol in child.get_symbols():
                        if symbol.is_referenced() and (symbol.is_free() or symbol.is_global()):
                            descendant_reads.add(symbol.get_name())
                    find_descendant_reads(child)
            find_descendant_reads(table)
            for name, (line, binding) in locations.bindings.items():
                symbol = symbols.get(name)
                if not symbol or symbol.is_parameter() or symbol.is_referenced() or name in descendant_reads:
                    continue
                if symbol.is_global() and table.get_type() != "module": continue
                if symbol.is_nonlocal(): continue
                if symbol.is_imported():
                    results.append(_issue(
                        f"Unused import `{name}`", "Low",
                        f"`{binding}` is imported on line {line}, but `{name}` is not referenced in this scope. If the import is intended only for side effects, keep it with a comment; otherwise it can be removed.",
                        line, "Maintainability", f"Remove `{binding}` if it is not needed for import-time side effects.", line,
                    ))
                elif symbol.is_assigned() and not symbol.is_namespace():
                    scope_label = "module" if table.get_type() == "module" else "function"
                    caveat = " If this module-level name is a public API consumed by other modules, keep and document it." if scope_label == "module" else ""
                    results.append(_issue(
                        f"Unused variable `{name}`", "Low",
                        f"`{name}` is assigned by `{binding}` on line {line}, but no read of `{name}` appears in this {scope_label} or a nested scope.{caveat}",
                        line, "Maintainability", f"Remove `{binding}` if its value is not needed.{caveat}", line,
                        suggested_code=_code_without_line(source, line),
                    ))
        for child in table.get_children(): visit_table(child)
    visit_table(root_table)
    return results


def _pure_expression(node: ast.AST) -> bool:
    if isinstance(node, (ast.Constant, ast.Name)): return True
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return all(_pure_expression(value) for value in node.elts)
    if isinstance(node, ast.Dict):
        return all(key is None or _pure_expression(key) for key in node.keys) and all(_pure_expression(value) for value in node.values)
    if isinstance(node, ast.UnaryOp): return _pure_expression(node.operand)
    if isinstance(node, ast.BinOp): return _pure_expression(node.left) and _pure_expression(node.right)
    if isinstance(node, ast.BoolOp): return all(_pure_expression(value) for value in node.values)
    if isinstance(node, ast.Compare): return _pure_expression(node.left) and all(_pure_expression(value) for value in node.comparators)
    return False


def _duplicate_assignments(tree: ast.Module, source: str) -> list[dict]:
    """Catch only adjacent, identical assignments with syntactically pure values."""
    findings = []
    for parent in ast.walk(tree):
        body = getattr(parent, "body", None)
        if not isinstance(body, list): continue
        for previous, current in zip(body, body[1:]):
            if not isinstance(previous, ast.Assign) or not isinstance(current, ast.Assign): continue
            if not _pure_expression(previous.value) or not _pure_expression(current.value): continue
            if (len(previous.targets) == len(current.targets) == 1
                    and isinstance(previous.targets[0], ast.Name)
                    and isinstance(current.targets[0], ast.Name)
                    and ast.dump(previous.targets[0], include_attributes=False) == ast.dump(current.targets[0], include_attributes=False)
                    and ast.dump(previous.value, include_attributes=False) == ast.dump(current.value, include_attributes=False)):
                target = ", ".join(ast.unparse(item) for item in current.targets)
                expression = ast.unparse(current.value)
                findings.append(_issue(
                    f"Repeated identical assignment to `{target}`", "Low",
                    f"Line {current.lineno} assigns `{target} = {expression}` immediately after the same assignment on line {previous.lineno}. The second assignment overwrites the same value without an intervening operation.",
                    current.lineno, "Maintainability", f"Remove the duplicate assignment on line {current.lineno}.", current.lineno,
                    _code_without_line(source, current.lineno),
                ))
    return findings


class _PythonVisitor(ast.NodeVisitor):
    def __init__(self, source: str):
        self.source = source
        self.source_lines = source.splitlines()
        self.functions = self.classes = self.loops = self.conditionals = self.complexity = 0
        self.findings = []
        self.loop_stack: list[ast.AST] = []
    def visit_FunctionDef(self, node):
        self.functions += 1; self.complexity += 1
        if len(node.args.args) > 6:
            self.findings.append(_issue("Many function parameters", "Low", f"'{node.name}' has {len(node.args.args)} parameters; consider grouping related values.", node.lineno, "Maintainability", "Group parameters that represent one cohesive concept into a named configuration object, or split the function if the parameters serve unrelated tasks."))
        self.generic_visit(node)
    visit_AsyncFunctionDef = visit_FunctionDef
    def visit_ClassDef(self, node):
        self.classes += 1; self.generic_visit(node)
    def visit_For(self, node):
        self.loops += 1; self.complexity += 1
        if self.loop_stack:
            outer = self.loop_stack[-1]
            outer_iter, inner_iter = ast.unparse(outer.iter), ast.unparse(node.iter)
            outer_target, inner_target = ast.unparse(outer.target), ast.unparse(node.target)
            self.findings.append(_issue(
                "Repeated nested iteration", "Low",
                f"`for {inner_target} in {inner_iter}` (line {node.lineno}) runs for each `for {outer_target} in {outer_iter}` iteration (line {outer.lineno}). When those iterables contain N and M items, respectively, this body executes N×M times (O(N×M)); that cost is justified if every pair is needed.",
                node.lineno, "Performance",
                f"Keep both loops when each pair must be processed. If the inner loop repeatedly searches `{inner_iter}` for a matching key, build a set or dictionary before the outer loop and use a lookup instead.",
                getattr(node, "end_lineno", node.lineno),
            ))
        self.loop_stack.append(node)
        self.generic_visit(node)
        self.loop_stack.pop()
    def visit_AsyncFor(self, node):
        self.visit_For(node)
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
        if isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}:
            self.findings.append(_issue("Dynamic code execution", "High", f"`{ast.unparse(node)}` executes a string as Python code at line {node.lineno}. If that string can contain user-controlled data, it can run unintended operations.", node.lineno, "Security", "For JSON input, replace evaluation with `json.loads(value)`. If dynamic execution is essential, ensure the string is trusted and review the design separately.", getattr(node, "end_lineno", node.lineno)))
        self.generic_visit(node)

    def visit_Compare(self, node):
        for index, operator in enumerate(node.ops):
            left = node.left if index == 0 else node.comparators[index - 1]
            right = node.comparators[index]
            literal = next((value for value in (left, right) if isinstance(value, ast.Constant) and value.value is not None), None)
            if len(node.ops) == 1 and isinstance(operator, (ast.Is, ast.IsNot)) and literal is not None:
                line = node.lineno
                expression = ast.unparse(node)
                operator_text = "is not" if isinstance(operator, ast.IsNot) else "is"
                self.findings.append(_issue(
                    "Identity comparison with a value literal", "Low",
                    f"`{expression}` uses `{operator_text}` with a non-None literal on line {line}. `is` checks object identity, not value equality, so the result is not a reliable value comparison.",
                    line, "Correctness", f"Use `==` or `!=` for value comparison: `{expression.replace(' is not ', ' != ').replace(' is ', ' == ')}`.", getattr(node, "end_lineno", line),
                ))
                break
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
    visitor = _PythonVisitor(source); visitor.visit(tree)
    metrics.update({"functions": visitor.functions, "classes": visitor.classes, "loops": visitor.loops,
                    "conditionals": visitor.conditionals, "approx_complexity": visitor.complexity})
    findings = _unused_bindings(tree, source) + _duplicate_assignments(tree, source) + visitor.findings
    if not visitor.functions and metrics["lines_of_code"] > 20:
        findings.append(_issue("Large module without functions", "Low", "Consider splitting the module into focused functions or classes."))
    recommendations = list(dict.fromkeys(f["suggestion"] for f in findings if f.get("suggestion")))
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
