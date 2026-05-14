# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - Unreleased

Initial public release.

### Supported providers

OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, Cohere, DeepSeek,
Together, Fireworks, xAI, and Perplexity.

### Library

- `validateKey(key, options)` — single-key validation with a uniform result
  shape across all providers. Maps HTTP responses to one of: `invalid_key`,
  `rate_limited`, `server_error`, `network_error`, `timeout`,
  `unknown_provider`, `malformed_key`.
- `validateKeys(keys, options)` — parallel bulk validation.
- `registerProvider(provider)` / `listProviders()` / `detectProvider(key)` —
  custom provider registration and discovery against the global registry.
- `ValidationOptions`:
  - `provider` — force a specific provider, bypass auto-detect
  - `providers` — scope auto-detection to a caller-supplied list (enables
    tree-shaking)
  - `offline` — skip the network call; format-only validity check
  - `timeoutMs` (default 10_000), `retries` (default 1)
  - `fetch`, `signal` — dependency injection
- Tree-shakable subpath imports:
  - `llm-key-validator/core` — primitives only, zero providers preloaded
  - `llm-key-validator/providers` — side-effect-free re-exports of all 12
    provider objects; bundlers drop the ones you don't import

### CLI

Two equivalent commands installed: `llm-key-validator` and `lkv`.

- `lkv <key> [<key>...]` — auto-detect provider from key prefix
- `lkv --provider <name>` — force a specific provider; falls back to
  `<PROVIDER>_API_KEY` env var if no key argument is given
- `lkv --stdin` — read keys from stdin (one per line); errors if stdin is a TTY
- `lkv --env` — validate every `<PROVIDER>_API_KEY` exported in the environment
- `lkv --offline` — format-only check, no network
- `lkv scan [<file>...]` — parse `.env`-style files, mask values, validate each
  `*_API_KEY` / `*_TOKEN` / `*_SECRET` / `*_KEY` entry. Skips common
  placeholders (`changeme`, `your_api_key_here`, `<...>`). Supports
  `--check-revoked` to hide passing entries.
- `lkv --list-providers` — table of supported providers with env var names
- `lkv --json` — JSON output for scripting
- Exit codes: `0` all valid, `1` usage error, `2` ≥1 invalid, `3` unexpected
- Honors `NO_COLOR`; colors disabled when output is not a TTY
- Keys masked to `first 7 ... last 4` in all output

### GitHub Action

Top-level [action.yml](action.yml) wraps the CLI:

```yaml
- uses: jishnu-mohan/llm-key-validator@v1
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  with:
    args: "--env --json"
```

### Compatibility

- Node ≥ 20
- Pure `fetch` + `AbortController`; runs in Node, Bun, Deno, Cloudflare
  Workers, and browsers
- Dual ESM + CJS builds with TypeScript declarations
- Zero runtime dependencies

### Verifiable distribution

- `npm publish --provenance` attestations bind each released version to the
  GitHub Actions run + commit SHA that built it
- `npm run size` budgets enforced in CI: ~2.14 KB main bundle (brotli)
