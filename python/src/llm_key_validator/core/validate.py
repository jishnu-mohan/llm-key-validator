"""Single entry point for key validation. Mirrors `src/core/validate.ts`."""

from __future__ import annotations

import re
import time
from functools import partial
from typing import Any

from .http import request as default_request
from .registry import detect_provider, get_provider
from .types import (
    HttpError,
    HttpFn,
    HttpResponse,
    Provider,
    ProviderRawResult,
    ValidationContext,
    ValidationFailureReason,
    ValidationResult,
)

DEFAULT_TIMEOUT_MS = 10_000
DEFAULT_RETRIES = 1

_QUOTE_STRIP_RE = re.compile(r"""^["'](.*)["']$""")


def normalize_key(raw: Any) -> str:
    if not isinstance(raw, str):
        return ""
    s = raw.strip()
    m = _QUOTE_STRIP_RE.match(s)
    if m:
        return m.group(1)
    return s


def _failure(
    provider: str,
    reason: ValidationFailureReason,
    message: str,
    latency_ms: int,
    status: int | None = None,
) -> ValidationResult:
    return ValidationResult(
        valid=False,
        provider=provider,
        latency_ms=latency_ms,
        reason=reason,
        status=status,
        message=message,
    )


def _map_status_to_reason(status: int) -> ValidationFailureReason | None:
    if status in (401, 403):
        return "invalid_key"
    if status == 429:
        return "rate_limited"
    if status >= 500:
        return "server_error"
    return None


def validate_key(
    raw_key: Any,
    *,
    provider: str | None = None,
    providers: list[Provider] | None = None,
    offline: bool = False,
    timeout_ms: int | None = None,
    retries: int | None = None,
    http: HttpFn | None = None,
) -> ValidationResult:
    """Validate an API key against the matching provider's probe endpoint.

    Resolution order: ``provider`` (forced name) > ``providers`` list >
    global registry. ``offline=True`` short-circuits the network call.
    """
    start = time.monotonic()

    def elapsed() -> int:
        return int((time.monotonic() - start) * 1000)

    key = normalize_key(raw_key)
    if not key:
        return _failure(
            provider or "unknown",
            "malformed_key",
            "API key must be a non-empty string",
            elapsed(),
        )

    resolved: Provider | None
    if provider is not None:
        if providers is not None:
            resolved = next((p for p in providers if p.name == provider), None)
        else:
            resolved = get_provider(provider)
        if resolved is None:
            return _failure(
                provider,
                "unknown_provider",
                f"Unknown provider: {provider}",
                elapsed(),
            )
    else:
        if providers is not None:
            resolved = next((p for p in providers if p.detect(key)), None)
        else:
            resolved = detect_provider(key)
        if resolved is None:
            return _failure(
                "unknown",
                "unknown_provider",
                "Could not detect provider from key. Specify `provider` explicitly.",
                elapsed(),
            )

    if offline:
        if not resolved.detect(key):
            return _failure(
                resolved.name,
                "invalid_key",
                f"Key format does not match provider {resolved.name}",
                elapsed(),
            )
        return ValidationResult(
            valid=True,
            provider=resolved.name,
            latency_ms=elapsed(),
            metadata={"offline": True},
        )

    effective_timeout = timeout_ms if timeout_ms is not None else DEFAULT_TIMEOUT_MS
    effective_retries = retries if retries is not None else DEFAULT_RETRIES

    if http is None:
        bound_http: HttpFn = partial(
            default_request,
            timeout_ms=effective_timeout,
            retries=effective_retries,
        )
    else:
        bound_http = http

    ctx = ValidationContext(http=bound_http)
    try:
        raw: ProviderRawResult = resolved.validate(key, ctx)
    except HttpError as err:
        return _failure(resolved.name, err.reason, str(err), elapsed(), err.status)
    except Exception as err:
        return _failure(resolved.name, "network_error", str(err), elapsed())

    if raw.ok:
        return ValidationResult(
            valid=True,
            provider=resolved.name,
            latency_ms=elapsed(),
            metadata=raw.metadata,
        )

    reason = _map_status_to_reason(raw.status) or "invalid_key"
    return _failure(resolved.name, reason, f"HTTP {raw.status}", elapsed(), raw.status)


def validate_keys(
    keys: list[Any],
    *,
    provider: str | None = None,
    providers: list[Provider] | None = None,
    offline: bool = False,
    timeout_ms: int | None = None,
    retries: int | None = None,
    http: HttpFn | None = None,
) -> list[ValidationResult]:
    """Validate a list of keys sequentially. Mirrors ``validateKeys`` from the TS package."""
    return [
        validate_key(
            k,
            provider=provider,
            providers=providers,
            offline=offline,
            timeout_ms=timeout_ms,
            retries=retries,
            http=http,
        )
        for k in keys
    ]


__all__ = ["HttpResponse", "normalize_key", "validate_key", "validate_keys"]
