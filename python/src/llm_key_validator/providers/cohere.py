from __future__ import annotations

import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

_DETECT = re.compile(r"^[A-Za-z0-9]{40}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http(
        "https://api.cohere.com/v1/models",
        headers={"Authorization": f"Bearer {key}"},
    )
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json() or {}
    models = body.get("models") if isinstance(body, dict) else None
    count = len(models) if isinstance(models, list) else 0
    return ProviderRawResult(status=res.status, ok=True, metadata={"modelCount": count})


cohere = Provider(
    name="cohere",
    display_name="Cohere",
    key_env_var="COHERE_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
