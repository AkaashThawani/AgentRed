"""Environment + runtime configuration. Loaded once at import time."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")


def _required(name: str) -> str:
    val = os.getenv(name, "").strip().strip("'").strip('"')
    if not val:
        raise RuntimeError(
            f"Missing required env var {name}. Add it to backend/.env"
        )
    return val


def _optional(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip("'").strip('"')


GEMINI_KEY: str = _required("GEMINI_KEY")
GEMINI_MODEL_FAST: str = _optional("GEMINI_MODEL_FAST", "gemini-2.5-flash")
GEMINI_MODEL_REASONING: str = _optional("GEMINI_MODEL_REASONING", "gemini-2.5-pro")

# Optional infra
CLICKHOUSE_URL: str = _optional("CLICKHOUSE_URL")
CLICKHOUSE_USER: str = _optional("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD: str = _optional("CLICKHOUSE_PASSWORD")
CLICKHOUSE_DATABASE: str = _optional("CLICKHOUSE_DATABASE", "default")

DATADOG_API_KEY: str = _optional("DATADOG_API_KEY")
DATADOG_APP_KEY: str = _optional("DATADOG_APP_KEY")
DATADOG_SITE: str = _optional("DATADOG_SITE", "datadoghq.com")

# Scan tunables
HTTP_TIMEOUT_S: float = float(_optional("HTTP_TIMEOUT_S", "20"))
MAX_CONCURRENT_TESTS: int = int(_optional("MAX_CONCURRENT_TESTS", "3"))
TESTS_PER_SKILL: int = int(_optional("TESTS_PER_SKILL", "7"))
ADAPTIVE_FOLLOWUP_COUNT: int = int(_optional("ADAPTIVE_FOLLOWUP_COUNT", "3"))
