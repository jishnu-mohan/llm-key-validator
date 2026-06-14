from __future__ import annotations

import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

_DETECT = re.compile(r"^gsk_[A-Za-z0-9]{20,}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http(
        "https://api.groq.com/openai/v1/models",
        headers={"Authorization": f"Bearer {key}"},
    )
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json() or {}
    data = body.get("data") if isinstance(body, dict) else None
    count = len(data) if isinstance(data, list) else 0
    return ProviderRawResult(status=res.status, ok=True, metadata={"modelCount": count})


groq = Provider(
    name="groq",
    display_name="Groq",
    key_env_var="GROQ_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
