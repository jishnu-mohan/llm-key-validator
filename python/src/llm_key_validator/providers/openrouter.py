from __future__ import annotations

import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

_DETECT = re.compile(r"^sk-or-(v\d-)?[A-Za-z0-9]{32,}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http(
        "https://openrouter.ai/api/v1/auth/key",
        headers={"Authorization": f"Bearer {key}"},
    )
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json() or {}
    data = body.get("data") if isinstance(body, dict) else None
    metadata = None
    if isinstance(data, dict):
        metadata = {
            "label": data.get("label"),
            "usage": data.get("usage"),
            "limit": data.get("limit"),
        }
    return ProviderRawResult(status=res.status, ok=True, metadata=metadata)


openrouter = Provider(
    name="openrouter",
    display_name="OpenRouter",
    key_env_var="OPENROUTER_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
