"""HTTP wrapper: timeout, linear backoff, retries on 5xx and network errors.

Mirrors `src/core/http.ts` from the TS package: linear backoff of
``0.25 * (attempt + 1)`` seconds, retry on ``status >= 500`` and on
network errors, no retry on 4xx. Built on :mod:`urllib.request` to keep
runtime dependencies at zero.
"""

from __future__ import annotations

import socket
import time
from typing import TYPE_CHECKING
from urllib import error as urlerror
from urllib import request as urlrequest

from .types import HttpError, HttpResponse

if TYPE_CHECKING:
    pass


def _do_request(
    url: str,
    method: str,
    headers: dict[str, str] | None,
    body: bytes | None,
    timeout_seconds: float,
) -> HttpResponse:
    req = urlrequest.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as resp:
            data = resp.read()
            status = int(resp.status)
    except urlerror.HTTPError as e:
        # 4xx/5xx still return a response we want to inspect.
        try:
            data = e.read()
        except Exception:
            data = b""
        status = int(e.code)
        return HttpResponse(status=status, ok=False, body=data)
    return HttpResponse(status=status, ok=200 <= status < 300, body=data)


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout_ms: int = 10_000,
    retries: int = 1,
) -> HttpResponse:
    """Send an HTTP request with retries on 5xx and transient network errors.

    Raises :class:`HttpError` for timeouts, network errors after retries
    exhausted, and 5xx after retries exhausted. Returns an
    :class:`HttpResponse` otherwise (including for 4xx).
    """
    last_error: HttpError | None = None
    timeout_seconds = timeout_ms / 1000.0

    for attempt in range(retries + 1):
        try:
            res = _do_request(url, method, headers, body, timeout_seconds)
        except TimeoutError:
            raise HttpError("timeout", f"Request timed out after {timeout_ms}ms") from None
        except urlerror.URLError as e:
            # urllib wraps socket.timeout in URLError on some platforms.
            inner = getattr(e, "reason", None)
            if isinstance(inner, (socket.timeout, TimeoutError)):
                raise HttpError("timeout", f"Request timed out after {timeout_ms}ms") from None
            last_error = HttpError("network_error", str(inner or e))
            if attempt < retries:
                time.sleep(0.25 * (attempt + 1))
                continue
            raise last_error from None
        except (OSError, ConnectionError) as e:
            last_error = HttpError("network_error", str(e))
            if attempt < retries:
                time.sleep(0.25 * (attempt + 1))
                continue
            raise last_error from None

        if res.status >= 500 and attempt < retries:
            last_error = HttpError("server_error", f"Server error {res.status}", status=res.status)
            time.sleep(0.25 * (attempt + 1))
            continue
        return res

    if last_error is not None:
        raise last_error
    raise HttpError("server_error", "Exhausted retries")
