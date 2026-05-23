"""Tiny shared Gemini client. Sync SDK wrapped in run_in_executor for async use."""
from __future__ import annotations

import asyncio
from typing import Any

import google.generativeai as genai
from google.generativeai.types import GenerationConfig  # type: ignore[attr-defined]

from ..config import GEMINI_KEY, GEMINI_MODEL_FAST, GEMINI_MODEL_REASONING

genai.configure(api_key=GEMINI_KEY)


def _model(name: str) -> genai.GenerativeModel:
    return genai.GenerativeModel(name)


async def generate_json(prompt: str, response_schema: Any, *, reasoning: bool = False,
                        system_instruction: str | None = None) -> Any:
    """Run a Gemini call and parse the JSON response against `response_schema`.

    `response_schema` is either a pydantic class or a typing construct
    (e.g. `list[TestCase]`) — google-generativeai converts both.
    """
    model_name = GEMINI_MODEL_REASONING if reasoning else GEMINI_MODEL_FAST
    # Lower temperature = more reproducible scans. Was 0.9 / 0.4 — that produced large
    # run-to-run swings in trust score. The reasoning model stays at 0.4 so it can
    # actually reason; test generation drops to 0.3 to keep payloads consistent.
    gen_cfg = GenerationConfig(
        response_mime_type="application/json",
        response_schema=response_schema,
        temperature=0.3 if not reasoning else 0.4,
        top_p=0.8,
    )
    model = genai.GenerativeModel(
        model_name,
        system_instruction=system_instruction,
        generation_config=gen_cfg,
    )

    def _call() -> str:
        resp = model.generate_content(prompt)
        return resp.text or ""

    # Inner timeout — fail safe BEFORE orchestrator's 30s outer timeout. If the SDK
    # buffers / retries / hangs internally, we abandon the future and the orchestrator
    # gets a clean asyncio.TimeoutError it can handle.
    text = await asyncio.wait_for(
        asyncio.get_event_loop().run_in_executor(None, _call),
        timeout=25.0,
    )
    return text  # caller parses to its Pydantic model
