"""Private FastAPI adapter around the preserved static analyzer. Never executes submitted code."""
import hmac
import os
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from analysis.analyzer import analyze

app = FastAPI(title="CodeMind analysis service", docs_url=None, redoc_url=None)
class Request(BaseModel):
    source: str = Field(min_length=1, max_length=100_000)
    language: str

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/analyze")
def run(payload: Request, service_token: str | None = Header(default=None, alias="x-codemind-service-token")):
    expected = os.environ.get("ANALYSIS_SERVICE_TOKEN", "")
    if not expected or not service_token or not hmac.compare_digest(service_token, expected):
        raise HTTPException(401, "Unauthorized")
    if payload.language not in {"Python", "C++"}:
        raise HTTPException(400, "Unsupported language")
    try: return analyze(payload.source, payload.language)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
