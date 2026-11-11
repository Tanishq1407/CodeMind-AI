import json
import tempfile
import unittest
from pathlib import Path
from analysis.analyzer import analyze, analyze_cpp, analyze_python
from database.store import get_history, initialize, save_analysis

class AnalyzerTests(unittest.TestCase):
    def test_python_ast_counts(self):
        report=analyze_python("class A:\n def run(self, x):\n  if x:\n   for y in x:\n    print(y)\n")
        self.assertEqual(report["metrics"]["classes"],1)
        self.assertEqual(report["metrics"]["functions"],1)
        self.assertEqual(report["metrics"]["loops"],1)
        self.assertEqual(report["metrics"]["conditionals"],1)
        self.assertFalse(any("print" in f["title"].lower() for f in report["findings"]))
    def test_dynamic_code_and_score(self):
        report=analyze("eval(user_input)","Python")
        self.assertEqual(report["quality_score"],85)
        self.assertEqual(report["score_explanation"]["total_penalty"],15)
    def test_python_unused_local_and_nested_loop_evidence(self):
        report=analyze_python("def f(items, values):\n    unused = 4\n    for item in items:\n        for value in values:\n            print(item, value)\n")
        unused=next(f for f in report["findings"] if f["title"]=="Unused variable `unused`")
        nested=next(f for f in report["findings"] if f["title"]=="Repeated nested iteration")
        self.assertEqual(unused["line"],2)
        self.assertEqual(unused["category"],"Maintainability")
        self.assertIn("for value in values",nested["message"])
        self.assertIn("O(N×M)",nested["message"])
        self.assertEqual(nested["line"],4)
        self.assertEqual(nested["line_end"],5)
    def test_module_unused_variable_is_named_and_located_without_print_warning(self):
        report=analyze_python("x = 25\ny = 10\nprint(y)\n")
        finding=next(f for f in report["findings"] if f["title"]=="Unused variable `x`")
        self.assertEqual(finding["line"],1)
        self.assertIn("`x = 25`",finding["message"])
        self.assertIn("no read of `x`",finding["message"])
        self.assertFalse(any("print" in f["title"].lower() for f in report["findings"]))
    def test_unused_import_names_the_import_and_does_not_flag_used_imports(self):
        report=analyze_python("import os\nimport math\nprint(math.sqrt(4))\n")
        unused=next(f for f in report["findings"] if f["title"]=="Unused import `os`")
        self.assertEqual(unused["line"],1)
        self.assertFalse(any(f["title"]=="Unused import `math`" for f in report["findings"]))
    def test_nested_closure_reads_and_parameters_are_not_unused(self):
        report=analyze_python("def outer(items):\n    kept = 4\n    def inner():\n        return kept\n    return inner()\n")
        self.assertFalse(any(f["title"]=="Unused variable `kept`" for f in report["findings"]))
        self.assertFalse(any("items" in f["title"] for f in report["findings"]))
    def test_repeated_pure_assignment_is_specific(self):
        report=analyze_python("count = 0\ncount = 0\nprint(count)\n")
        finding=next(f for f in report["findings"] if f["title"]=="Repeated identical assignment to `count`")
        self.assertEqual(finding["line"],2)
        self.assertIn("line 1",finding["message"])
    def test_identity_comparison_to_literal_suggests_value_equality(self):
        report=analyze_python("if state is 0:\n    pass\n")
        finding=next(f for f in report["findings"] if f["title"]=="Identity comparison with a value literal")
        self.assertEqual(finding["line"],1)
        self.assertIn("==",finding["suggestion"])
    def test_requested_average_sample_has_precise_findings_without_output_false_positives(self):
        source="""def calculate_average(numbers):
    total = 0
    unused_value = 100

    for number in numbers:
        total = total + number
        total = total + 0

    if len(numbers) == 0:
        return 0

    average = total / len(numbers)
    return average


def find_maximum(numbers):
    maximum = numbers[0]

    for number in numbers:
        if number > maximum:
            maximum = number

    return maximum


def main():
    x = 25
    y = 10
    print(y)

    numbers = [10, 20, 30, 40]

    result = calculate_average(numbers)
    maximum = find_maximum(numbers)

    print("Average:", result)
    print("Maximum:", maximum)


if __name__ == "__main__":
    main()
"""
        report=analyze_python(source)
        by_title={finding["title"]:finding for finding in report["findings"]}
        self.assertEqual(by_title["Unused variable `unused_value`"]["line"],3)
        self.assertEqual(by_title["Unused variable `x`"]["line"],27)
        redundant=by_title["Potential redundant addition of zero to `total`"]
        self.assertEqual(redundant["line"],7)
        self.assertIn("total = total + 0",redundant["message"])
        self.assertIn("Remove `total = total + 0`",redundant["suggestion"])
        self.assertFalse(any("print" in title.lower() for title in by_title))
        self.assertFalse(any(title in by_title for title in ("Unused variable `y`","Unused variable `numbers`","Unused variable `result`","Unused variable `maximum`")))
        self.assertFalse(any("empty list" in finding["message"].lower() for finding in report["findings"]))
    def test_malformed_python(self):
        report=analyze_python("def broken(:")
        self.assertEqual(report["findings"][0]["title"],"Python syntax error")
        self.assertEqual(report["findings"][0]["severity"],"High")
    def test_empty_input(self):
        for fn in (analyze_python, analyze_cpp):
            report=fn(" ")
            self.assertEqual(report["metrics"]["lines_of_code"],0)
            self.assertEqual(report["findings"],[])
    def test_cpp_heuristics(self):
        report=analyze_cpp("#include <cstring>\nvoid f(){ strcpy(a,b); } // TODO")
        titles={f["title"] for f in report["findings"]}
        self.assertIn("Unbounded strcpy() usage",titles)
        self.assertIn("Unresolved TODO/FIXME",titles)
        self.assertIn("Approximate",report["analysis_method"])
    def test_report_json_serializable(self):
        self.assertIn('"quality_score"',json.dumps(analyze_python("x=1")))
    def test_unknown_language(self):
        with self.assertRaises(ValueError): analyze("", "Rust")

class DatabaseTests(unittest.TestCase):
    def test_init_save_retrieve(self):
        # Keep test files inside the workspace; some managed Windows environments
        # expose the system temporary folder as read-only.
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as td:
            path=Path(td)/"nested"/"test.sqlite3"
            initialize(path)
            report=analyze_python("print('hello')")
            rid=save_analysis(report,"hello.py",path)
            rows=get_history(path)
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]["id"],rid)
            self.assertEqual(rows[0]["source_name"],"hello.py")
            self.assertEqual(rows[0]["report"]["language"],"Python")

if __name__=="__main__": unittest.main()
