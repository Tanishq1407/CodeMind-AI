FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/codemind
RUN groupadd --system app && useradd --system --gid app --home-dir /nonexistent app
COPY analysis_service/requirements.txt ./analysis_service/requirements.txt
RUN pip install --no-cache-dir -r analysis_service/requirements.txt
COPY analysis ./analysis
COPY analysis_service ./analysis_service
USER app
EXPOSE 8000
CMD ["uvicorn", "analysis_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
