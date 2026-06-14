"""Built-in provider registry.

Registration order matters: auto-detect returns the first match, so the
more-specific prefixes must come before the broader ones. ``sk-ant-`` and
``sk-or-`` come before generic ``sk-``; opaque alphanumerics like Cohere
and Mistral are last so they don't false-positive against prefixed keys.
"""

from __future__ import annotations

from ..core.registry import register_provider
from ..core.types import Provider
from .anthropic import anthropic
from .cohere import cohere
from .deepseek import deepseek
from .fireworks import fireworks
from .google import google
from .groq import groq
from .mistral import mistral
from .openai import openai
from .openrouter import openrouter
from .perplexity import perplexity
from .together import together
from .xai import xai

built_in_providers: list[Provider] = [
    anthropic,  # sk-ant-
    openrouter,  # sk-or-
    deepseek,  # sk-<32 hex>
    openai,  # sk-... (catch-all for OpenAI-style)
    google,  # AIza...
    groq,  # gsk_...
    xai,  # xai-...
    fireworks,  # fw_...
    perplexity,  # pplx-...
    together,  # 64 hex or tgp_v1_...
    cohere,  # 40 alnum
    mistral,  # 32 alnum
]

_registered = False


def register_built_in_providers() -> None:
    """Register all built-in providers in the global registry.

    Idempotent — safe to call multiple times. The eager top-level
    ``llm_key_validator`` import calls this; the ``llm_key_validator.core``
    entry intentionally does not, so tree-shake-style consumers can BYO.
    """
    global _registered
    if _registered:
        return
    for p in built_in_providers:
        register_provider(p)
    _registered = True


__all__ = [
    "anthropic",
    "built_in_providers",
    "cohere",
    "deepseek",
    "fireworks",
    "google",
    "groq",
    "mistral",
    "openai",
    "openrouter",
    "perplexity",
    "register_built_in_providers",
    "together",
    "xai",
]
