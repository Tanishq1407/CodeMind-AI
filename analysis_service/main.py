"""Private FastAPI adapter around the preserved static analyzer. Never executes submitted code."""
import hmac
import logging
import os
from typing import Literal

from fastapi import FastAPI, HTTPException, Header
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from analysis.analyzer import analyze

logger = logging.getLogger("codemind.analysis")
app = FastAPI(title="CodeMind analysis service", docs_url=None, redoc_url=None, openapi_url=None)


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(min_length=1, max_length=100_000)
    language: Literal["Python", "C++"]

    @field_validator("source")
    @classmethod
    def enforce_utf8_byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 100_000:
            raise ValueError("Source must be 100 KB or smaller.")
        return value


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _exc: RequestValidationError):
    # Pydantic validation errors can contain the submitted value; never echo source code.
    return JSONResponse(status_code=422, content={"detail": "Invalid analysis request."})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def run(payload: AnalysisRequest, service_token: str | None = Header(default=None, alias="x-codemind-service-token")):
    expected = os.environ.get("ANALYSIS_SERVICE_TOKEN", "")
    if not expected or not service_token or not hmac.compare_digest(service_token, expected):
        raise HTTPException(401, "Unauthorized")
    try:
        return analyze(payload.source, payload.language)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        # Log only the exception type. Submitted source and service credentials are private.
        logger.error("Analysis failed (%s)", type(exc).__name__)
        raise HTTPException(500, "Analysis could not be completed.") from None
