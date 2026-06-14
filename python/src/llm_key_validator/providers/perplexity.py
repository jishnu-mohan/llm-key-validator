from __future__ import annotations

import json
import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

# Perplexity does not expose a `GET /models` endpoint, so we send a minimal
# chat request (1 token output) as the cheapest probe. The hardcoded model
# name below is a known stable identifier as of writing — if Perplexity
# renames or deprecates it, a valid key will return 400 and be mapped to
# `invalid_key`. Watch for that signal during dependency upkeep.
# API reference: https://docs.perplexity.ai/api-reference/chat-completions
_PROBE_MODEL = "sonar"
_DETECT = re.compile(r"^pplx-[A-Za-z0-9]{32,}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    payload = json.dumps(
        {
            "model": _PROBE_MODEL,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
        }
    ).encode("utf-8")
    res = ctx.http(
        "https://api.perplexity.ai/chat/completions",
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        body=payload,
    )
    return ProviderRawResult(status=res.status, ok=res.ok)


perplexity = Provider(
    name="perplexity",
    display_name="Perplexity",
    key_env_var="PERPLEXITY_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
