# llm-key-validator (Python)

Validate API keys for 12 LLM providers — OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, Cohere, DeepSeek, Together, Fireworks, xAI, and Perplexity. Zero runtime dependencies, stdlib only.

This is the Python sibling of the [npm package of the same name](https://www.npmjs.com/package/llm-key-validator). Both packages share provider specs and ship in lockstep.

## Install

```bash
pip install llm-key-validator
```

Requires Python ≥ 3.10.

## Library

```python
from llm_key_validator import validate_key

result = validate_key("sk-ant-...")
if result.valid:
    print(f"Valid {result.provider} key ({result.latency_ms} ms)")
else:
    print(f"Invalid: {result.reason} — {result.message}")
```

### Options

```python
validate_key(
    key,
    provider="openai",     # force provider (skip auto-detect)
    offline=True,           # format-only, no network
    timeout_ms=5000,
    retries=2,
)
```

### Scoped providers (tree-shake-style)

Skip the global registry; only the providers you pass are considered for detection.

```python
from llm_key_validator.core import validate_key
from llm_key_validator.providers import openai, anthropic

result = validate_key(key, providers=[openai, anthropic])
```

### Custom providers

```python
from llm_key_validator.core import register_provider, Provider, ProviderRawResult, ValidationContext

def my_validate(key: str, ctx: ValidationContext) -> ProviderRawResult:
    res = ctx.http("https://api.example.com/v1/me", headers={"Authorization": f"Bearer {key}"})
    return ProviderRawResult(status=res.status, ok=res.ok)

register_provider(Provider(
    name="my-provider",
    display_name="My Provider",
    key_env_var="MY_API_KEY",
    detect=lambda k: k.startswith("mp_"),
    validate=my_validate,
))
```

## CLI

```bash
# auto-detect
llm-key-validator sk-ant-...

# force provider
lkv -p openai $OPENAI_API_KEY

# validate every <PROVIDER>_API_KEY in your environment
lkv --env

# format-only (no network)
lkv --offline sk-...

# scan a .env file
lkv scan .env

# pipe a key
echo "$ANTHROPIC_API_KEY" | lkv --stdin

# JSON output
lkv --json --env | jq
```

`lkv` and `llm-key-validator` are aliases.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | all keys valid |
| 1 | usage error |
| 2 | one or more keys invalid |
| 3 | unexpected error |

## Security

- Prefer `--stdin` or `--env` over passing keys on argv (shell history).
- Validation hits live provider APIs and may count toward your rate limits.
- For untrusted input, pass `offline=True` to skip the network.

## License

MIT
