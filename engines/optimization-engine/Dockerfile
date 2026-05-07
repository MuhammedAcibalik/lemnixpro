FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir . \
  && adduser --disabled-password --gecos "" --home /app lemnixpro \
  && chown -R lemnixpro:lemnixpro /app

USER lemnixpro

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
