import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from analysis_service.main import app


class AnalysisServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_is_public_and_has_stable_response(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_authenticated_python_ast_analysis_returns_precise_findings(self):
        source = "x = 25\ny = 10\nprint(y)\n"
        with patch.dict(os.environ, {"ANALYSIS_SERVICE_TOKEN": "test-service-token"}):
            response = self.client.post(
                "/analyze",
                headers={"x-codemind-service-token": "test-service-token"},
                json={"source": source, "language": "Python"},
            )
        self.assertEqual(response.status_code, 200)
        report = response.json()
        self.assertEqual(report["analysis_method"], "AST")
        unused = next(item for item in report["findings"] if item["title"] == "Unused variable `x`")
        self.assertEqual(unused["line"], 1)
        self.assertEqual(unused["suggested_code"], "y = 10\nprint(y)")
        self.assertFalse(any("print" in item["title"].lower() for item in report["findings"]))

    def test_missing_or_incorrect_token_is_rejected(self):
        with patch.dict(os.environ, {"ANALYSIS_SERVICE_TOKEN": "expected-token"}):
            missing = self.client.post("/analyze", json={"source": "x = 1", "language": "Python"})
            incorrect = self.client.post("/analyze", headers={"x-codemind-service-token": "wrong-token"}, json={"source": "x = 1", "language": "Python"})
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(incorrect.status_code, 401)
        self.assertEqual(missing.json(), {"detail": "Unauthorized"})

    def test_invalid_input_is_safe_and_does_not_echo_submitted_code(self):
        private_code = "private source that must not appear in validation errors"
        response = self.client.post("/analyze", json={"source": private_code, "language": "Rust"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"detail": "Invalid analysis request."})
        self.assertNotIn(private_code, response.text)

    def test_utf8_byte_limit_is_enforced(self):
        source = "😀" * 30_000  # Below the character limit, above 100 KB in UTF-8.
        response = self.client.post("/analyze", json={"source": source, "language": "Python"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(source, response.text)

    def test_unexpected_analyzer_failure_is_safe(self):
        from analysis_service import main

        with patch.dict(os.environ, {"ANALYSIS_SERVICE_TOKEN": "test-service-token"}), patch.object(main, "analyze", side_effect=RuntimeError("private source detail")):
            response = self.client.post(
                "/analyze",
                headers={"x-codemind-service-token": "test-service-token"},
                json={"source": "x = 1", "language": "Python"},
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Analysis could not be completed."})
        self.assertNotIn("private source detail", response.text)


if __name__ == "__main__":
    unittest.main()
