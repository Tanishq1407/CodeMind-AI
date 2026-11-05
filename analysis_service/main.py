"""Private FastAPI adapter around the preserved static analyzer. Never executes submitted code."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from analysis.analyzer import analyze

app = FastAPI(title="CodeMind analysis service", docs_url=None, redoc_url=None)
class Request(BaseModel):
    source: str = Field(min_length=1, max_length=100_000)
    language: str

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/analyze")
def run(payload: Request):
    if payload.language not in {"Python", "C++"}:
        raise HTTPException(400, "Unsupported language")
    try: return analyze(payload.source, payload.language)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
