# Contributing

## Adding a new provider

1. Create `src/providers/<name>.ts`:

   ```ts
   import type { Provider } from "../core/types.js";

   export const myProvider: Provider = {
     name: "myprovider",
     displayName: "My Provider",
     detect: (key) => /^mp_[A-Za-z0-9]{20,}$/.test(key),
     validate: async (key, { http, signal }) => {
       const res = await http("https://api.myprovider.com/v1/models", {
         headers: { Authorization: `Bearer ${key}` },
         signal,
       });
       if (!res.ok) return { status: res.status, ok: false };
       const body = await res.json().catch(() => ({}));
       return { status: res.status, ok: true, metadata: { modelCount: body.data?.length ?? 0 } };
     },
   };
   ```

2. Export and register it in `src/providers/index.ts`. Order matters — register
   more-specific prefixes before more-general ones so auto-detect picks them
   first.

3. Add the provider to the `cases` array in `tests/providers.test.ts`.

4. Update the supported-providers table in `README.md`.

## Brittleness watchlist

These provider integrations depend on specifics that may drift over time:

- **Perplexity** — there is no `GET /models` endpoint, so we send a 1-token
  chat probe with `model: "sonar"` ([src/providers/perplexity.ts](src/providers/perplexity.ts)).
  If Perplexity renames or deprecates that model, valid keys will fail with a
  400 (mapped to `invalid_key`). Update `PROBE_MODEL` when this happens.
- **Anthropic** — the `anthropic-version: 2023-06-01` header is pinned. The
  `/v1/models` endpoint has accepted this version since launch and there's no
  reason to bump it, but watch the changelog at
  https://docs.claude.com/en/api/versioning.
- **Mistral / Cohere** — neither uses a key prefix. Auto-detection falls back
  to length + alphabet heuristics that can false-positive on SHA-1 (Cohere) or
  MD5 (Mistral) hex digests. Documented in README; prefer `--provider` for these.

## Local development

```bash
npm install
npm run typecheck    # tsc on src/ + examples/
npm run lint         # biome check
npm test             # vitest run (no network — all fetch is mocked)
npm run build        # tsup → dist/ (ESM + CJS + .d.ts)
npm run size         # size-limit budgets
```

### Python sibling package

The `python/` directory ships a stdlib-only port of the same library and CLI.
When you add or modify a provider in `src/providers/`, mirror the change in
`python/src/llm_key_validator/providers/<name>.py` so the two packages stay in
lockstep — same regex, same probe URL, same headers, same registration order.

```bash
cd python
pip install -e ".[dev]"
pytest                                     # 115 tests; no network
ruff check . && ruff format --check .
mypy src/llm_key_validator                 # strict
python -m build && twine check dist/*      # release artifact gate
```

CI for Python lives in [`.github/workflows/python-ci.yml`](.github/workflows/python-ci.yml)
and runs only on `python/**` changes across Python 3.10–3.13.

The full pre-publish pipeline runs locally via:

```bash
npm run prepublishOnly
```

This is the same set of checks CI runs.

## Testing the CLI locally

Build first, then call the binary directly:

```bash
npm run build
node dist/cli.cjs --help
node dist/cli.cjs --offline sk-ant-test
node dist/cli.cjs scan .env.example
```

After `npm link` (or a global install), both `llm-key-validator` and `lkv`
resolve to the same binary, so the short alias works during development too.

## How tests are organized

| File | Covers |
|---|---|
| [tests/http.test.ts](tests/http.test.ts) | timeout, retry, abort, network-error mapping |
| [tests/validate.test.ts](tests/validate.test.ts) | `validateKey` option handling, status→reason mapping, scoped providers, `--offline` |
| [tests/providers.test.ts](tests/providers.test.ts) | per-provider detect regex, expected host, auth header shape |
| [tests/scan.test.ts](tests/scan.test.ts) | `.env` parser (placeholders, quotes, comments, line numbers) |
| [tests/cli.test.ts](tests/cli.test.ts) | end-to-end CLI flags via `runCli(argv, io, options)` |

Tests **never hit the network** — all `fetch` calls are injected via the
`fetch` option of `validateKey`. Use the [tests/helpers.ts](tests/helpers.ts)
`mockFetch` helper for new tests.

## Releasing

Releases are **manually tagged** — there's no auto-release-on-merge. Rationale
in [the changelog](CHANGELOG.md). The typical flow:

1. **Make sure `main` is ready**
   ```bash
   git checkout main && git pull
   git status                       # working tree clean
   npm run prepublishOnly           # full local gate
   ```
2. **Bump the version** in [package.json](package.json) and add a CHANGELOG entry
   under a new `## [X.Y.Z]` heading. Commit:
   ```bash
   git commit -am "chore: release X.Y.Z"
   ```
3. **Tag and push**
   ```bash
   git tag -a vX.Y.Z -m "X.Y.Z: <one-line summary>"
   git push origin main
   git push origin vX.Y.Z
   ```
4. **What happens automatically**: [`.github/workflows/release.yml`](.github/workflows/release.yml)
   matches the `v*` tag and runs lint → typecheck → test → build → `npm publish
   --provenance --access public` via npm Trusted Publishing (OIDC, no token
   secret needed — configured at
   https://www.npmjs.com/package/llm-key-validator/access).
5. **Verify** on https://www.npmjs.com/package/llm-key-validator.

### If the publish step fails

The tag and commit are pushed; only the npm publish failed. After fixing the
issue, delete and re-push the tag to retrigger:

```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
```

If npm already received a partial publish (rare), bump to the next patch
version instead — published npm versions are immutable.
