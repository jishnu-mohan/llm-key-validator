from __future__ import annotations

import pytest

from llm_key_validator.core import http as http_module
from llm_key_validator.core.types import HttpError, HttpResponse


class TestRetryPolicy:
    def test_4xx_returned_immediately_no_retry(self, monkeypatch):
        calls = {"n": 0}

        def fake_do(*args, **kwargs):
            calls["n"] += 1
            return HttpResponse(status=401, ok=False, body=b"")

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        res = http_module.request("https://example.test", retries=2)
        assert res.status == 401
        assert calls["n"] == 1

    def test_5xx_retries_then_returns_response(self, monkeypatch):
        """After retries are exhausted on 5xx, return the response (validate maps it)."""
        calls = {"n": 0}

        def fake_do(*args, **kwargs):
            calls["n"] += 1
            return HttpResponse(status=500, ok=False, body=b"")

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        monkeypatch.setattr(http_module.time, "sleep", lambda s: None)
        res = http_module.request("https://example.test", retries=2)
        assert res.status == 500
        assert calls["n"] == 3  # initial + 2 retries

    def test_5xx_recovers_on_retry(self, monkeypatch):
        sequence = [
            HttpResponse(status=500, ok=False, body=b""),
            HttpResponse(status=200, ok=True, body=b"{}"),
        ]

        def fake_do(*args, **kwargs):
            return sequence.pop(0)

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        monkeypatch.setattr(http_module.time, "sleep", lambda s: None)
        res = http_module.request("https://example.test", retries=1)
        assert res.status == 200

    def test_timeout_raises_immediately(self, monkeypatch):
        def fake_do(*args, **kwargs):
            raise TimeoutError()

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        monkeypatch.setattr(http_module.time, "sleep", lambda s: None)
        with pytest.raises(HttpError) as ei:
            http_module.request("https://example.test", retries=2, timeout_ms=100)
        assert ei.value.reason == "timeout"

    def test_network_error_retries(self, monkeypatch):
        calls = {"n": 0}

        def fake_do(*args, **kwargs):
            calls["n"] += 1
            raise ConnectionError("connection refused")

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        monkeypatch.setattr(http_module.time, "sleep", lambda s: None)
        with pytest.raises(HttpError) as ei:
            http_module.request("https://example.test", retries=2)
        assert ei.value.reason == "network_error"
        assert calls["n"] == 3

    def test_backoff_is_linear(self, monkeypatch):
        sleeps: list[float] = []

        def fake_do(*args, **kwargs):
            return HttpResponse(status=500, ok=False, body=b"")

        monkeypatch.setattr(http_module, "_do_request", fake_do)
        monkeypatch.setattr(http_module.time, "sleep", lambda s: sleeps.append(s))
        http_module.request("https://example.test", retries=2)
        # attempt 0 sleeps 0.25, attempt 1 sleeps 0.5, attempt 2 hits the
        # cap (attempt == retries) and returns the response without sleeping.
        assert sleeps == [0.25, 0.5]
