# llm-key-validator

[![npm version](https://img.shields.io/npm/v/llm-key-validator.svg)](https://www.npmjs.com/package/llm-key-validator)
[![CI](https://github.com/jishnu-mohan/llm-key-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/jishnu-mohan/llm-key-validator/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/llm-key-validator.svg)](package.json)

Validate API keys for **OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, Cohere, DeepSeek, Together, Fireworks, xAI, and Perplexity** — as a CLI or a TypeScript library.

- Zero runtime dependencies (uses native `fetch`, Node ≥ 20)
- Modular: add a new provider in ~15 lines
- Library + CLI + GitHub Action from one install
- Distinguishes invalid keys from rate limits, timeouts, and network errors
- Env-var aware (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- Tree-shakable: bundle only the providers you import (~500 B per provider; 2 KB for all 12)
- Works in Node, Bun, Deno, Cloudflare Workers, and browsers
- `--offline` mode for instant format-only validation (no network call)
- `scan` subcommand for `.env` file audits

## Who is this for?

- **BYOK SaaS builders** (Cursor/Cline/OpenWebUI/LibreChat clones) — one library replaces 12 per-provider error-mapping branches
- **Developers with many AI keys** — `llm-key-validator --env` tells you which still work
- **DevOps / platform teams** — CI/CD pre-flight and cron monitoring; clean exit codes
- **On-call debugging** — instantly distinguishes "key revoked" from "provider down"

Not the right fit for: server-side runtime auth (handle 401 at request time), org/scope introspection, cost/usage analytics.

## Install

```bash
# global CLI (installs both `lkv` and `llm-key-validator` commands)
npm i -g llm-key-validator

# or one-shot without installing
npx llm-key-validator <key>

# as a library
npm i llm-key-validator
```

After global install, use the short alias `lkv` everywhere — both commands are
interchangeable.

## CLI

```bash
# auto-detect provider from key prefix
lkv sk-ant-...

# force a provider
lkv <key> --provider openai

# read keys from stdin (preferred — avoids shell history)
echo "$OPENAI_API_KEY" | lkv --stdin

# bulk
lkv <key1> <key2> <key3>

# validate every <PROVIDER>_API_KEY found in the environment
lkv --env

# provider env-var fallback: read OPENAI_API_KEY from env
lkv --provider openai

# JSON output for scripting
lkv <key> --json

# list all supported providers (and their env vars)
lkv --list-providers

# offline mode — format-only check, no network call
lkv --offline sk-ant-...

# scan a .env file (.env and .env.local are checked by default)
lkv scan
lkv scan .env.production
lkv scan --check-revoked   # hide VALIDs, show only failures
```

Exit codes: `0` all valid, `1` usage error, `2` ≥ 1 invalid, `3` unexpected error.

## Library

### Default (eager — all 12 providers loaded)

```ts
import { validateKey, validateKeys } from "llm-key-validator";

const result = await validateKey("sk-ant-...");
if (result.valid) {
  console.log("OK —", result.provider, "in", result.latencyMs, "ms");
} else {
  console.log("Failed:", result.reason, result.message);
}

// Bulk
const results = await validateKeys([key1, key2]);
```

### Tree-shakable (only pay for what you use)

For browser bundles, edge workers, or library consumers that only care about
one or two providers, import from `/core` + `/providers`:

```ts
import { validateKey } from "llm-key-validator/core";
import { openai, anthropic } from "llm-key-validator/providers";

await validateKey(key, { providers: [openai, anthropic] });
```

The core entry has zero side effects; bundlers will drop every provider you
don't import. Typical bundle sizes:

| Entry | Size (min+gz) |
|---|---|
| `llm-key-validator` (eager, 12 providers) | ~5 KB |
| `llm-key-validator/core` (no providers) | ~2 KB |
| `llm-key-validator/providers` (single import) | ~0.5 KB per provider |

### Options

```ts
await validateKey(key, {
  provider: "anthropic",  // force, skip auto-detect
  providers: [openai],    // scope detection to this list (tree-shake friendly)
  offline: true,          // skip network call; format-only check
  timeoutMs: 5000,        // default 10_000
  retries: 1,             // default 1 (5xx / network errors)
  fetch: customFetch,     // injectable
  signal: abortSignal,
});
```

### Browser, Bun, Cloudflare Workers, Deno

The library is pure `fetch` + `AbortController` — no Node-specific globals. See
[examples/](examples/) for a browser HTML demo, a Cloudflare Worker, and a Bun
script.

### Result shape

```ts
type ValidationResult =
  | { valid: true;  provider: string; latencyMs: number; metadata?: Record<string, unknown> }
  | { valid: false; provider: string; reason: ValidationFailureReason; status?: number; message: string; latencyMs: number };

type ValidationFailureReason =
  | "invalid_key"      // 401 / 403
  | "rate_limited"     // 429 — key is likely valid but throttled
  | "server_error"     // 5xx after retries
  | "network_error"    // DNS / connection refused
  | "timeout"
  | "unknown_provider"
  | "malformed_key";
```

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

## Adding a new provider

```ts
// my-provider.ts
import { registerProvider, type Provider } from "llm-key-validator";

const myProvider: Provider = {
  name: "myprovider",
  displayName: "My Provider",
  detect: (key) => key.startsWith("mp_"),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.myprovider.com/v1/me", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    return { status: res.status, ok: res.ok };
  },
};

registerProvider(myProvider);
```

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
