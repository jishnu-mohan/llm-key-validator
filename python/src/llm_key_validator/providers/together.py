from __future__ import annotations

import re

from ..core.types import Provider, ProviderRawResult, ValidationContext

_DETECT_HEX = re.compile(r"^[a-f0-9]{64}$")
_DETECT_TGP = re.compile(r"^tgp_v\d_[A-Za-z0-9_-]{32,}$")


def _detect(key: str) -> bool:
    return bool(_DETECT_HEX.match(key) or _DETECT_TGP.match(key))


def _validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http(
        "https://api.together.xyz/v1/models",
        headers={"Authorization": f"Bearer {key}"},
    )
    if not res.ok:
        return ProviderRawResult(status=res.status, ok=False)
    body = res.json()
    if isinstance(body, list):
        count = len(body)
    elif isinstance(body, dict) and isinstance(body.get("data"), list):
        count = len(body["data"])
    else:
        count = 0
    return ProviderRawResult(status=res.status, ok=True, metadata={"modelCount": count})


together = Provider(
    name="together",
    display_name="Together AI",
    key_env_var="TOGETHER_API_KEY",
    detect=_detect,
    validate=_validate,
)
