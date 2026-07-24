# llm-key-validator

[![npm version](https://img.shields.io/npm/v/llm-key-validator.svg)](https://www.npmjs.com/package/llm-key-validator)
[![CI](https://github.com/jishnu-mohan/llm-key-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/jishnu-mohan/llm-key-validator/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/llm-key-validator.svg)](package.json)

Check if an LLM API key is valid — no install required:

```bash
npx llm-key-validator sk-ant-...
```

Supports **OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, Cohere,
DeepSeek, Together, Fireworks, xAI, and Perplexity**, as a CLI or a TypeScript
library. Zero runtime dependencies, works in Node ≥ 20 (and Bun/Deno/Cloudflare
Workers/browsers as a library).

- Auto-detects the provider from the key's prefix
- Distinguishes invalid keys from rate limits, timeouts, and network errors
- `--env` validates every `*_API_KEY` in your environment; `scan` audits a `.env` file
- `--offline` mode checks key format with no network call
- Also available as a library (`npm i llm-key-validator`) and a GitHub Action

## Install

```bash
# no install — one-shot
npx llm-key-validator <key>

# global CLI (installs both `lkv` and `llm-key-validator`)
npm i -g llm-key-validator

# as a library
npm i llm-key-validator

# Python (≥ 3.8, stdlib only, same CLI surface)
pip install llm-key-validator
```

After global install, use the short alias `lkv` everywhere. See
[`python/README.md`](python/README.md) for Python-specific examples.

## CLI

```bash
# auto-detect provider from key prefix
npx llm-key-validator sk-ant-...

# force a provider
lkv <key> --provider openai

# read keys from stdin (preferred — avoids shell history)
echo "$OPENAI_API_KEY" | lkv --stdin

# bulk
lkv <key1> <key2> <key3>

# validate every <PROVIDER>_API_KEY found in the environment
lkv --env

# JSON output for scripting
lkv <key> --json

# offline mode — format-only check, no network call
lkv --offline sk-ant-...

# scan a .env file (.env and .env.local are checked by default)
lkv scan
lkv scan --check-revoked   # hide VALIDs, show only failures
```

Exit codes: `0` all valid, `1` usage error, `2` ≥ 1 invalid, `3` unexpected error.
Run `lkv --help` for the full flag list.

## Library

```ts
import { validateKey } from "llm-key-validator";

const result = await validateKey("sk-ant-...");
if (result.valid) {
  console.log("OK —", result.provider, "in", result.latencyMs, "ms");
} else {
  console.log("Failed:", result.reason, result.message);
}
```

For bundle-size-sensitive consumers (browser, edge workers), import only the
providers you need:

```ts
import { validateKey } from "llm-key-validator/core";
import { openai, anthropic } from "llm-key-validator/providers";

await validateKey(key, { providers: [openai, anthropic] });
```

`llm-key-validator/core` has zero import-time side effects, so bundlers drop
every provider you don't import (~500 B per provider vs. ~5 KB for the eager
default with all 12).

### Options

```ts
await validateKey(key, {
  provider: "anthropic",  // force, skip auto-detect
  offline: true,          // skip network call; format-only check
  timeoutMs: 5000,        // default 10_000
  retries: 1,             // default 1 (5xx / network errors)
});
```

Result shape:

```ts
type ValidationResult =
  | { valid: true;  provider: string; latencyMs: number }
  | { valid: false; provider: string; reason: ValidationFailureReason; message: string };

type ValidationFailureReason =
  | "invalid_key" | "rate_limited" | "server_error"
  | "network_error" | "timeout" | "unknown_provider" | "malformed_key";
```

See [examples/](examples/) for browser, Cloudflare Worker, and Bun usage.

## Supported providers

| Provider | Env var | Key prefix | Endpoint |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `sk-...` | `GET /v1/models` |
| Anthropic | `ANTHROPIC_API_KEY` | `sk-ant-...` | `GET /v1/models` |
| Google Gemini | `GOOGLE_API_KEY` | `AIza...` | `GET /v1beta/models?key=` |
| Groq | `GROQ_API_KEY` | `gsk_...` | `GET /openai/v1/models` |
| Mistral | `MISTRAL_API_KEY` | 32 alphanumeric | `GET /v1/models` |
| OpenRouter | `OPENROUTER_API_KEY` | `sk-or-...` | `GET /v1/auth/key` |
| Cohere | `COHERE_API_KEY` | 40 alphanumeric | `GET /v1/models` |
| DeepSeek | `DEEPSEEK_API_KEY` | `sk-<32 hex>` | `GET /models` |
| Together | `TOGETHER_API_KEY` | 64 hex or `tgp_v1_...` | `GET /v1/models` |
| Fireworks | `FIREWORKS_API_KEY` | `fw_...` | `GET /inference/v1/models` |
| xAI (Grok) | `XAI_API_KEY` | `xai-...` | `GET /v1/models` |
| Perplexity | `PERPLEXITY_API_KEY` | `pplx-...` | `POST /chat/completions` (max_tokens: 1) |

> **Note**: most providers expose a `/models` listing that costs nothing. Perplexity has no such endpoint — a single 1-token chat call is the smallest probe and may incur a tiny charge.
>
> **Auto-detect caveat**: Mistral and Cohere keys are opaque alphanumeric strings with no distinguishing prefix. They are tried *last* during auto-detect to minimize false positives, but for any 32- or 40-character alphanumeric input, prefer `--provider mistral` or `--provider cohere` to be explicit.

Want to add a provider? See [CONTRIBUTING.md](CONTRIBUTING.md).

## GitHub Action

Validate every `*_API_KEY` secret in your repo on every PR:

```yaml
# .github/workflows/check-keys.yml
name: Check keys
on: [pull_request, workflow_dispatch]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: jishnu-mohan/llm-key-validator@v1
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          args: "--env --json"
```

The default `args` (`--env --json`) validates every standard `*_API_KEY` env var
exposed to the job. Fails the build (exit 1) if any key is invalid.

## Security

- Validation calls hit the live provider APIs — only validate keys you own
- Some endpoints count toward rate limits even when not billed
- Prefer `--stdin` over passing keys on argv (shell history)
- Keys are never logged in full; CLI output masks to first 7 and last 4 characters

See [SECURITY.md](SECURITY.md) for the disclosure process.

## License

MIT
