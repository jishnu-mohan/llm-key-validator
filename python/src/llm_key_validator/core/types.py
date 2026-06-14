from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol

ValidationFailureReason = Literal[
    "invalid_key",
    "rate_limited",
    "server_error",
    "network_error",
    "timeout",
    "unknown_provider",
    "malformed_key",
]

HttpErrorReason = Literal["timeout", "network_error", "server_error"]


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    ok: bool
    body: bytes

    def json(self) -> Any:
        if not self.body:
            return None
        import json as _json

        try:
            return _json.loads(self.body)
        except (ValueError, UnicodeDecodeError):
            return None


class HttpFn(Protocol):
    def __call__(
        self,
        url: str,
        *,
        method: str = ...,
        headers: dict[str, str] | None = ...,
        body: bytes | None = ...,
    ) -> HttpResponse: ...


@dataclass(frozen=True, slots=True)
class ValidationContext:
    http: HttpFn


@dataclass(frozen=True, slots=True)
class ProviderRawResult:
    status: int
    ok: bool
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class Provider:
    name: str
    display_name: str
    detect: Callable[[str], bool]
    validate: Callable[[str, ValidationContext], ProviderRawResult]
    key_env_var: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid: bool
    provider: str
    latency_ms: int
    reason: ValidationFailureReason | None = None
    status: int | None = None
    message: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "valid": self.valid,
            "provider": self.provider,
            "latency_ms": self.latency_ms,
        }
        if self.reason is not None:
            d["reason"] = self.reason
        if self.status is not None:
            d["status"] = self.status
        if self.message is not None:
            d["message"] = self.message
        if self.metadata is not None:
            d["metadata"] = self.metadata
        return d


class HttpError(Exception):
    def __init__(
        self,
        reason: HttpErrorReason,
        message: str = "",
        status: int | None = None,
    ) -> None:
        super().__init__(message or reason)
        self.reason: HttpErrorReason = reason
        self.status: int | None = status
