"""Optional configured text adapter. No automatic model downloads or substitutions."""

import os
from typing import Protocol

import httpx
from pydantic import BaseModel, Field


class ScriptDraft(BaseModel):
    script: str = Field(min_length=1, max_length=50000)
    provider: str
    model: str
    review_required: bool = True


class TextProvider(Protocol):
    def generate(self, topic: str) -> ScriptDraft: ...


class OllamaProvider:
    def generate(self, topic: str) -> ScriptDraft:
        url, model = os.getenv("OLLAMA_URL"), os.getenv("OLLAMA_MODEL")
        if not url or not model:
            raise ValueError("Ollama is not configured")
        # Operator-controlled URL; never accepts request-supplied endpoints.
        with httpx.Client(timeout=90) as client:
            response = client.post(
                url.rstrip("/") + "/api/generate",
                json={
                    "model": model,
                    "prompt": f"Write concise factual video narration. Flag uncertain claims. Topic: {topic}",
                    "stream": False,
                    "options": {"num_predict": 700},
                },
            )
            response.raise_for_status()
            return ScriptDraft(
                script=response.json()["response"].strip(),
                provider="ollama",
                model=model,
            )


def generate_script(topic: str):
    return OllamaProvider().generate(topic).model_dump()
