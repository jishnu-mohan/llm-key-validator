from __future__ import annotations

import pytest

from llm_key_validator.providers import (
    anthropic,
    cohere,
    deepseek,
    fireworks,
    google,
    groq,
    mistral,
    openai,
    openrouter,
    perplexity,
    together,
    xai,
)

# Sample keys for each provider — long enough to satisfy the {N,} quantifiers.
_VALID = {
    "anthropic": "sk-ant-abcdefghijklmnopqrstuvwxyz",
    "openrouter": "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789",
    "deepseek": "sk-" + "a" * 32,
    "openai": "sk-abcdefghijklmnopqrstuvwxyz0123456789",
    "google": "AIza" + "B" * 30,
    "groq": "gsk_" + "x" * 24,
    "xai": "xai-" + "1" * 32,
    "fireworks": "fw_" + "y" * 24,
    "perplexity": "pplx-" + "z" * 32,
    "together_hex": "a" * 64,
    "together_tgp": "tgp_v1_" + "A" * 32,
    "cohere": "B" * 40,
    "mistral": "C" * 32,
}

_INVALID_FOR_PREFIX = {
    "anthropic": ["sk-or-foo", "sk-foo", "garbage", "sk-ant-short"],
    "openrouter": ["sk-foo", "sk-ant-x", "garbage"],
    "deepseek": ["sk-" + "a" * 31, "sk-" + "g" * 32, "sk-ant-foo"],
    "openai": ["sk-ant-foo", "sk-or-foo", "garbage", "sk-x"],
    "google": ["AIza-too-short", "garbage"],
    "groq": ["gsk-foo", "gsk_short", "garbage"],
    "xai": ["xai_foo", "xai-short", "garbage"],
    "fireworks": ["fw-foo", "fw_short", "garbage"],
    "perplexity": ["pplx_foo", "pplx-short", "garbage"],
    "cohere": ["A" * 39, "A" * 41, "with-dash" + "x" * 30],
    "mistral": ["A" * 31, "A" * 33, "x" * 32 + "_"],
}

_PROVIDERS = {
    "anthropic": anthropic,
    "openrouter": openrouter,
    "deepseek": deepseek,
    "openai": openai,
    "google": google,
    "groq": groq,
    "xai": xai,
    "fireworks": fireworks,
    "perplexity": perplexity,
    "together": together,
    "cohere": cohere,
    "mistral": mistral,
}


@pytest.mark.parametrize("name,key", list(_VALID.items()))
def test_valid_keys_detected(name, key):
    prov_name = "together" if name.startswith("together_") else name
    assert _PROVIDERS[prov_name].detect(key)


@pytest.mark.parametrize(
    "name,key",
    [(n, k) for n, keys in _INVALID_FOR_PREFIX.items() for k in keys],
)
def test_invalid_keys_not_detected(name, key):
    assert not _PROVIDERS[name].detect(key)


def test_together_accepts_64_hex(fake_http_factory):
    http = fake_http_factory({"status": 200, "body": [{"id": "x"}, {"id": "y"}]})
    from llm_key_validator.core.validate import validate_key

    r = validate_key("a" * 64, provider="together", http=http)
    assert r.valid is True
    assert r.metadata == {"modelCount": 2}


def test_together_accepts_data_wrapped(fake_http_factory):
    http = fake_http_factory({"status": 200, "body": {"data": [{"id": "x"}]}})
    from llm_key_validator.core.validate import validate_key

    r = validate_key("a" * 64, provider="together", http=http)
    assert r.valid is True
    assert r.metadata == {"modelCount": 1}


def test_anthropic_sends_correct_headers(fake_http_factory):
    http = fake_http_factory({"status": 200, "body": {"data": []}})
    from llm_key_validator.core.validate import validate_key

    validate_key("sk-ant-abcdefghijklmnop", provider="anthropic", http=http)
    call = http.calls[0]
    assert call["url"] == "https://api.anthropic.com/v1/models"
    assert call["headers"]["x-api-key"] == "sk-ant-abcdefghijklmnop"
    assert call["headers"]["anthropic-version"] == "2023-06-01"


def test_google_passes_key_in_query(fake_http_factory):
    http = fake_http_factory({"status": 200, "body": {"models": []}})
    from llm_key_validator.core.validate import validate_key

    key = "AIza" + "B" * 30
    validate_key(key, provider="google", http=http)
    assert "key=" + key in http.calls[0]["url"]


def test_perplexity_posts_chat_completions(fake_http_factory):
    http = fake_http_factory({"status": 200, "body": {}})
    from llm_key_validator.core.validate import validate_key

    validate_key("pplx-" + "z" * 32, provider="perplexity", http=http)
    call = http.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "https://api.perplexity.ai/chat/completions"
    assert call["headers"]["Content-Type"] == "application/json"
    assert b'"sonar"' in (call["body"] or b"")


def test_registration_order_is_load_bearing():
    """anthropic and openrouter must auto-detect before generic openai."""
    from llm_key_validator.core.registry import detect_provider

    ant_key = "sk-ant-abcdefghijklmnop"
    p = detect_provider(ant_key)
    assert p is not None and p.name == "anthropic"

    or_key = "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789"
    p = detect_provider(or_key)
    assert p is not None and p.name == "openrouter"
