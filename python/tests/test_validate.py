from __future__ import annotations

from llm_key_validator.core.registry import (
    detect_provider,
    list_providers,
    register_provider,
    unregister_provider,
)
from llm_key_validator.core.types import (
    Provider,
    ProviderRawResult,
)
from llm_key_validator.core.validate import normalize_key, validate_key, validate_keys


class TestNormalizeKey:
    def test_trims_whitespace_and_newlines(self):
        assert normalize_key("  sk-foo  \n") == "sk-foo"

    def test_strips_surrounding_double_quotes(self):
        assert normalize_key('"sk-foo"') == "sk-foo"

    def test_strips_surrounding_single_quotes(self):
        assert normalize_key("'sk-foo'") == "sk-foo"

    def test_returns_empty_for_non_strings(self):
        assert normalize_key(None) == ""
        assert normalize_key(42) == ""
        assert normalize_key([]) == ""


class TestValidateKey:
    def test_empty_key_is_malformed(self):
        r = validate_key("")
        assert r.valid is False
        assert r.reason == "malformed_key"

    def test_undetected_key_is_unknown_provider(self):
        r = validate_key("garbage-no-prefix-match")
        assert r.valid is False
        assert r.reason == "unknown_provider"

    def test_unknown_forced_provider(self):
        r = validate_key("sk-anything", provider="no-such-provider")
        assert r.valid is False
        assert r.reason == "unknown_provider"

    def test_success_via_fake_http(self, fake_http_factory):
        http = fake_http_factory({"status": 200, "body": {"data": [{"id": "gpt-4o"}]}})
        r = validate_key(
            "sk-abcdefghijklmnopqrstuvwxyz0123456789",
            provider="openai",
            http=http,
        )
        assert r.valid is True
        assert r.metadata == {"modelCount": 1}

    def test_401_maps_to_invalid_key(self, fake_http_factory):
        http = fake_http_factory({"status": 401, "body": {}})
        r = validate_key(
            "sk-abcdefghijklmnopqrstuvwxyz0123456789",
            provider="openai",
            http=http,
        )
        assert r.valid is False
        assert r.reason == "invalid_key"
        assert r.status == 401

    def test_403_maps_to_invalid_key(self, fake_http_factory):
        http = fake_http_factory({"status": 403, "body": {}})
        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            http=http,
        )
        assert r.valid is False
        assert r.reason == "invalid_key"

    def test_429_maps_to_rate_limited(self, fake_http_factory):
        http = fake_http_factory({"status": 429, "body": {}})
        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            http=http,
        )
        assert r.valid is False
        assert r.reason == "rate_limited"

    def test_500_maps_to_server_error(self, fake_http_factory):
        # No retry in this path because validate_key passes retries=N to the
        # default HTTP wrapper; here we use a custom http that returns 500 once,
        # so validate_key sees a 5xx response (not an HttpError) and maps it.
        http = fake_http_factory({"status": 500, "body": {}})
        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            http=http,
        )
        assert r.valid is False
        assert r.reason == "server_error"

    def test_includes_latency(self, fake_http_factory):
        http = fake_http_factory({"status": 200, "body": {"data": []}})
        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            http=http,
        )
        assert r.latency_ms >= 0


class TestValidateKeysBulk:
    def test_validates_many_keys(self, fake_http_factory):
        http = fake_http_factory({"status": 200, "body": {"data": []}})
        r = validate_keys(
            ["sk-ant-abcdefghijklmnop", "sk-ant-zzzzzzzzzzzzzzzz"],
            provider="anthropic",
            http=http,
        )
        assert len(r) == 2
        assert all(x.valid for x in r)


class TestRegistryDetection:
    def test_anthropic_wins_over_openai(self):
        p = detect_provider("sk-ant-abcdefghijklmnop")
        assert p is not None and p.name == "anthropic"

    def test_openrouter_for_sk_or(self):
        p = detect_provider("sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789")
        assert p is not None and p.name == "openrouter"

    def test_google_for_aiza(self):
        p = detect_provider("AIzaSyA0123456789abcdefghijklmnopqrstuv")
        assert p is not None and p.name == "google"

    def test_groq_for_gsk(self):
        p = detect_provider("gsk_abcdefghijklmnopqrstuvwxyz")
        assert p is not None and p.name == "groq"

    def test_all_builtins_present(self):
        names = {p.name for p in list_providers()}
        expected = {
            "openai",
            "anthropic",
            "google",
            "groq",
            "mistral",
            "openrouter",
            "cohere",
            "deepseek",
            "together",
            "fireworks",
            "xai",
            "perplexity",
        }
        assert expected.issubset(names)


class TestOfflineMode:
    def test_valid_for_matching_key_no_network(self):
        def fail_http(*args, **kwargs):
            raise AssertionError("http should not be called")

        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            offline=True,
            http=fail_http,
        )
        assert r.valid is True
        assert r.metadata == {"offline": True}

    def test_invalid_when_key_does_not_match_forced_provider(self):
        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="openai",
            offline=True,
        )
        assert r.valid is False
        assert r.reason == "invalid_key"

    def test_unknown_provider_when_no_detect(self):
        r = validate_key("garbage-prefix-no-match", offline=True)
        assert r.valid is False
        assert r.reason == "unknown_provider"


class TestScopedProviders:
    def test_auto_detects_within_scope(self, fake_http_factory):
        from llm_key_validator.providers import openai

        http = fake_http_factory({"status": 200, "body": {"data": []}})
        r = validate_key(
            "sk-abcdefghijklmnopqrstuvwxyz0123456789",
            providers=[openai],
            http=http,
        )
        assert r.valid is True
        assert r.provider == "openai"

    def test_scoped_ignores_unlisted(self):
        from llm_key_validator.providers import openai

        r = validate_key("sk-ant-abcdefghijklmnop", providers=[openai])
        assert r.valid is False
        assert r.reason == "unknown_provider"

    def test_forced_provider_outside_scope_errors(self):
        from llm_key_validator.providers import openai

        r = validate_key(
            "sk-ant-abcdefghijklmnop",
            provider="anthropic",
            providers=[openai],
        )
        assert r.valid is False
        assert r.reason == "unknown_provider"


class TestCustomProvider:
    def teardown_method(self):
        unregister_provider("custom-test")

    def test_can_register_and_use_custom(self):
        def my_validate(key, ctx):
            return ProviderRawResult(status=200, ok=True, metadata={"hello": "world"})

        custom = Provider(
            name="custom-test",
            display_name="Custom Test",
            detect=lambda k: k.startswith("ct_"),
            validate=my_validate,
        )
        register_provider(custom)

        r = validate_key("ct_abc123")
        assert r.valid is True
        assert r.provider == "custom-test"
        assert r.metadata == {"hello": "world"}
