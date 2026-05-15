"""Shared pytest fixtures. ``fake_http`` mirrors vitest's ``mockFetch`` helper."""

from __future__ import annotations

import json as _json
from dataclasses import dataclass, field
from typing import Any

import pytest

from llm_key_validator.core.types import HttpResponse


@dataclass
class _MockResponse:
    status: int = 200
    ok: bool | None = None
    body: Any | None = None
    raise_exc: BaseException | None = None


@dataclass
class FakeHttp:
    """Callable matching the ``HttpFn`` protocol; records every call."""

    queue: list[_MockResponse]
    calls: list[dict[str, Any]] = field(default_factory=list)

    def __call__(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
        **kwargs: Any,
    ) -> HttpResponse:
        self.calls.append({"url": url, "method": method, "headers": headers, "body": body})
        cfg = self.queue[0] if len(self.queue) == 1 else self.queue.pop(0)
        if cfg.raise_exc is not None:
            raise cfg.raise_exc
        ok = cfg.ok if cfg.ok is not None else (200 <= cfg.status < 300)
        raw = b""
        if cfg.body is not None:
            raw = _json.dumps(cfg.body).encode("utf-8")
        return HttpResponse(status=cfg.status, ok=ok, body=raw)


def make_fake_http(responses: dict | list[dict]) -> FakeHttp:
    """Build a FakeHttp from a config dict (or list of dicts)."""
    items = responses if isinstance(responses, list) else [responses]
    queue = [
        _MockResponse(
            status=cfg.get("status", 200),
            ok=cfg.get("ok"),
            body=cfg.get("body"),
            raise_exc=cfg.get("raise"),
        )
        for cfg in items
    ]
    return FakeHttp(queue=queue)


@pytest.fixture()
def fake_http_factory():
    return make_fake_http


@pytest.fixture(autouse=True)
def _reset_registry():
    """Ensure built-in providers are registered before each test.

    Some tests register a custom provider; unregister it afterwards in the test.
    """
    # Importing llm_key_validator (eager) registers built-ins, but we want a
    # clean slate per test for the registry's *built-in* portion. The
    # registry is global so we just re-register; idempotent.
    from llm_key_validator.providers import register_built_in_providers

    register_built_in_providers()
    yield
