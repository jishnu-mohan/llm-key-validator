# Security Policy

## Supported versions

The current major release receives security fixes. Once a new minor lands,
the previous minor continues to receive critical patches (e.g., once 1.2.x
ships, 1.1.x will still get high-severity fixes).

| Version | Status |
|---|---|
| `1.0.x` | ✅ Supported |

## Reporting a vulnerability

If you discover a security issue, please report it privately:

- Open a private security advisory on GitHub:
  https://github.com/jishnu-mohan/llm-key-validator/security/advisories/new
- Or email: **jishnumpr@gmail.com** with the subject `[security] llm-key-validator`

Please include:
- A description of the issue and the affected version(s)
- Steps to reproduce, ideally as a minimal example
- The impact you anticipate

I aim to acknowledge reports within 72 hours and release a fix within 14 days
for high-severity issues. Coordinated disclosure is appreciated — please do
not open a public issue until a patch is published.

## What this package does with your keys

`llm-key-validator` sends each key to the corresponding provider's standard
authentication endpoint (typically `GET /v1/models` or equivalent) over HTTPS,
using native `fetch`. It does **not**:

- Persist keys to disk
- Send keys to any third party other than the named provider
- Log full keys (CLI output masks to first 7 / last 4 characters)
- Use any tracking, telemetry, or analytics

The package has **zero runtime dependencies**, reducing supply-chain risk.

### Local-only validation

If you don't want the key to leave your machine at all, use `--offline` (CLI)
or `{ offline: true }` (library). This runs the format-detection regex and
returns immediately without making any network request. Useful for client-side
BYOK forms that want fast feedback before submitting to a backend.

```bash
lkv --offline sk-ant-...
```

### Supply-chain integrity

Releases published from `release.yml` include **npm provenance attestations**
(`--provenance` flag). Verify a downloaded version's origin with:

```bash
npm view llm-key-validator@1.0.0 --json | jq .dist.attestations
```

The attestation cryptographically links the published artifact to the exact
GitHub Actions run + commit SHA that built it.

## Recommendations for users

- Prefer `--stdin` or `--env` over passing keys on the command line (shell
  history exposure)
- Pin to an exact version in `package.json` for production usage; do not use
  `^` ranges for security-sensitive packages
- Audit the source — ~1,300 lines across `src/`, zero runtime dependencies
- For CI: pin the GitHub Action to a commit SHA, not a floating `@v1` tag, if
  you need full supply-chain assurance:
  ```yaml
  - uses: jishnu-mohan/llm-key-validator@<commit-sha>  # not @v1
  ```
