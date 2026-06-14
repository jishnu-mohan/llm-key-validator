"""Pure validation primitives. No providers are registered automatically.

Pair with :mod:`llm_key_validator.providers` and pass ``providers=[...]``
to :func:`validate_key`, or call :func:`register_provider` explicitly.
"""

from __future__ import annotations

from .http import request
from .registry import (
    detect_provider,
    get_provider,
    list_providers,
    register_provider,
    unregister_provider,
)
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
from .validate import normalize_key, validate_key, validate_keys

__all__ = [
    "HttpError",
    "HttpFn",
    "HttpResponse",
    "Provider",
    "ProviderRawResult",
    "ValidationContext",
    "ValidationFailureReason",
    "ValidationResult",
    "detect_provider",
    "get_provider",
    "list_providers",
    "normalize_key",
    "register_provider",
    "request",
    "unregister_provider",
    "validate_key",
    "validate_keys",
]
