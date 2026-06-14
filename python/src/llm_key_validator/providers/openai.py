from __future__ import annotations

import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

# Exclude sk-ant- (Anthropic) and sk-or- (OpenRouter) so offline-mode + scoped
# detection are unambiguous.
_DETECT = re.compile(r"^sk-(?!ant-|or-)[A-Za-z0-9_-]{16,}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {key}"},
    )
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json() or {}
    data = body.get("data") if isinstance(body, dict) else None
    count = len(data) if isinstance(data, list) else 0
    return ProviderRawResult(status=res.status, ok=True, metadata={"modelCount": count})


openai = Provider(
    name="openai",
    display_name="OpenAI",
    key_env_var="OPENAI_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
