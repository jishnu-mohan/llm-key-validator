"""llm-key-validator (eager entry).

Importing this module registers all 12 built-in providers in the global
registry. For tree-shake-style usage, import from
:mod:`llm_key_validator.core` instead and pass ``providers=[...]`` to
:func:`validate_key`.
"""

from __future__ import annotations

from ._version import VERSION
from .core.http import request
from .core.registry import (
    detect_provider,
    get_provider,
    list_providers,
    register_provider,
    unregister_provider,
)
from .core.scan import EnvEntry, parse_env_file
from .core.types import (
    HttpError,
    HttpFn,
    HttpResponse,
    Provider,
    ProviderRawResult,
    ValidationContext,
    ValidationFailureReason,
    ValidationResult,
)
from .core.validate import normalize_key, validate_key, validate_keys
from .providers import (
    anthropic,
    built_in_providers,
    cohere,
    deepseek,
    fireworks,
    google,
    groq,
    mistral,
    openai,
    openrouter,
    perplexity,
    register_built_in_providers,
    together,
    xai,
)

register_built_in_providers()

__version__ = VERSION

__all__ = [
    "VERSION",
    "EnvEntry",
    "HttpError",
    "HttpFn",
    "HttpResponse",
    "Provider",
    "ProviderRawResult",
    "ValidationContext",
    "ValidationFailureReason",
    "ValidationResult",
    "__version__",
    "anthropic",
    "built_in_providers",
    "cohere",
    "deepseek",
    "detect_provider",
    "fireworks",
    "get_provider",
    "google",
    "groq",
    "list_providers",
    "mistral",
    "normalize_key",
    "openai",
    "openrouter",
    "parse_env_file",
    "perplexity",
    "register_built_in_providers",
    "register_provider",
    "request",
    "together",
    "unregister_provider",
    "validate_key",
    "validate_keys",
    "xai",
]
