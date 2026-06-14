from __future__ import annotations

import re
from urllib.parse import quote

from ..core.types import Provider, ProviderRawResult, ValidationContext

_DETECT = re.compile(r"^AIza[A-Za-z0-9_-]{30,}$")


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={quote(key, safe='')}"
    res = ctx.http(url)
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json() or {}
    models = body.get("models") if isinstance(body, dict) else None
    count = len(models) if isinstance(models, list) else 0
    return ProviderRawResult(status=res.status, ok=True, metadata={"modelCount": count})


google = Provider(
    name="google",
    display_name="Google (Gemini)",
    key_env_var="GOOGLE_API_KEY",
    detect=lambda k: bool(_DETECT.match(k)),
    validate=_validate,
)
