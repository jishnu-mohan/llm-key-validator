"""Parse .env-style content and extract entries that look like API keys.

Mirrors `src/core/scan.ts` byte-for-byte: same env-name pattern, same suffix
hint, same placeholder filter, same line-number semantics (1-indexed).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_KEY_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
_API_KEY_HINT_RE = re.compile(r"(_API_KEY|_KEY|_TOKEN|_SECRET)$")
_EXPORT_PREFIX_RE = re.compile(r"^\s*export\s+")

_PLACEHOLDER_PATTERNS = [
    re.compile(r"^changeme$", re.IGNORECASE),
    re.compile(r"^your[_-]?(api[_-]?)?key([_-]?here)?$", re.IGNORECASE),
    re.compile(r"^xxx+$", re.IGNORECASE),
    re.compile(r"^\.\.\.$"),
    re.compile(r"^todo$", re.IGNORECASE),
    re.compile(r"^placeholder$", re.IGNORECASE),
    re.compile(r"^<[^>]+>$"),
]


@dataclass(frozen=True)
class EnvEntry:
    name: str
    value: str
    line_number: int


def _is_placeholder(value: str) -> bool:
    if not value:
        return True
    return any(p.search(value) for p in _PLACEHOLDER_PATTERNS)


def parse_env_file(content: str) -> list[EnvEntry]:
    """Parse env-file text. Returns API-key-like entries; placeholders filtered."""
    entries: list[EnvEntry] = []
    lines = content.split("\n")
    # Mirror TS .split(/\r?\n/) — strip trailing \r if present.
    for i, raw in enumerate(lines):
        line = raw.rstrip("\r")
        line = _EXPORT_PREFIX_RE.sub("", line).strip()
        if not line or line.startswith("#"):
            continue
        eq = line.find("=")
        if eq < 1:
            continue
        name = line[:eq].strip()
        value = line[eq + 1 :].strip()

        if not _KEY_NAME_RE.match(name):
            continue
        if not _API_KEY_HINT_RE.search(name):
            continue

        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]

        # Inline " #..." comment is dropped.
        hash_idx = value.find(" #")
        if hash_idx >= 0:
            value = value[:hash_idx].strip()

        if _is_placeholder(value):
            continue

        entries.append(EnvEntry(name=name, value=value, line_number=i + 1))
    return entries


__all__ = ["EnvEntry", "parse_env_file"]
