from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _version

try:
    VERSION: str = _version("llm-key-validator")
except PackageNotFoundError:
    VERSION = "0.0.0+dev"
