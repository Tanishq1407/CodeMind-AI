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
        self.assertTrue(any(f["title"]=="Debug or console output" for f in report["findings"]))
    def test_dynamic_code_and_score(self):
        report=analyze("eval(user_input)","Python")
        self.assertEqual(report["quality_score"],85)
        self.assertEqual(report["score_explanation"]["total_penalty"],15)
    def test_python_unused_local_and_nested_loop_evidence(self):
        report=analyze_python("def f(items, values):\n    unused = 4\n    for item in items:\n        for value in values:\n            print(item, value)\n")
        unused=next(f for f in report["findings"] if f["title"]=="Assigned variable is never read")
        nested=next(f for f in report["findings"] if f["title"]=="Nested loop")
        self.assertEqual(unused["line"],2)
        self.assertEqual(unused["category"],"Maintainability")
        self.assertIn("may grow multiplicatively",nested["message"])
        self.assertEqual(nested["line"],4)
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
