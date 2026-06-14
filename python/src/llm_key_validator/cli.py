"""CLI surface for llm-key-validator.

``run_cli(argv, io)`` is the testable function; ``main()`` is the thin
console-script wrapper that constructs a real ``CliIO`` from ``sys`` and
``os``. Mirrors `src/cli.ts` and `src/cli-main.ts`.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from ._version import VERSION
from .core.registry import list_providers
from .core.scan import parse_env_file
from .core.types import HttpFn, Provider, ValidationResult
from .core.validate import validate_key
from .providers import register_built_in_providers


@dataclass
class CliIO:
    stdout: Callable[[str], None]
    stderr: Callable[[str], None]
    env: Mapping[str, str]
    stdin_is_tty: bool
    stdout_is_tty: bool
    read_stdin: Callable[[], str]
    read_file: Callable[[str], str | None]


@dataclass
class _ParsedArgs:
    subcommand: str | None = None
    positional: list[str] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)
    provider: str | None = None
    json: bool = False
    stdin: bool = False
    env: bool = False
    offline: bool = False
    check_revoked: bool = False
    timeout_ms: int | None = None
    list_providers: bool = False
    show_help: bool = False
    show_version: bool = False


class _UsageError(Exception):
    pass


def _parse_args(argv: list[str]) -> _ParsedArgs:
    args = _ParsedArgs()
    arg_list = list(argv)
    if arg_list and arg_list[0] == "scan":
        args.subcommand = "scan"
        arg_list = arg_list[1:]

    i = 0
    while i < len(arg_list):
        a = arg_list[i]
        if a in ("-h", "--help"):
            args.show_help = True
        elif a in ("-v", "--version"):
            args.show_version = True
        elif a == "--json":
            args.json = True
        elif a == "--stdin":
            args.stdin = True
        elif a == "--env":
            args.env = True
        elif a == "--offline":
            args.offline = True
        elif a == "--check-revoked":
            args.check_revoked = True
        elif a == "--list-providers":
            args.list_providers = True
        elif a in ("-p", "--provider"):
            i += 1
            if i >= len(arg_list):
                raise _UsageError("--provider requires a value")
            args.provider = arg_list[i]
        elif a == "--timeout":
            i += 1
            if i >= len(arg_list):
                raise _UsageError("--timeout requires a value (ms)")
            v = arg_list[i]
            try:
                n = int(v)
            except ValueError as e:
                raise _UsageError(f"Invalid --timeout: {v}") from e
            if n <= 0:
                raise _UsageError(f"Invalid --timeout: {v}")
            args.timeout_ms = n
        elif a.startswith("-"):
            raise _UsageError(f"Unknown option: {a}")
        else:
            args.positional.append(a)
            args.keys.append(a)
        i += 1
    return args


def _help_text() -> str:
    return f"""llm-key-validator v{VERSION}  (alias: lkv)

Validate API keys for OpenAI, Anthropic, Google, Groq, Mistral, OpenRouter,
Cohere, DeepSeek, Together, Fireworks, xAI, and Perplexity.

Usage:
  lkv <key> [<key>...] [options]
  lkv --stdin [options]
  lkv --env [options]
  lkv scan [<file>...] [options]
  lkv --list-providers

Options:
  -p, --provider <name>   Force a specific provider (skip auto-detect).
                          Without a key, reads <PROVIDER>_API_KEY from env.
      --offline           Skip the network call; report format-only validity.
      --timeout <ms>      Request timeout in ms (default: 10000)
      --json              Emit results as JSON
      --stdin             Read keys from stdin, one per line
      --env               Validate every <PROVIDER>_API_KEY found in env
      --check-revoked     scan: only report keys that fail (hide VALID)
      --list-providers    List all supported providers
  -v, --version           Show version
  -h, --help              Show this help

Examples:
  lkv sk-ant-...                            # auto-detect provider
  lkv -p openai $OPENAI_API_KEY             # force provider
  lkv --env                                 # check all env-var keys
  lkv --offline sk-...                      # format-only, no network
  lkv scan                                  # scan .env / .env.local
  lkv scan .env.production
  echo "$ANTHROPIC_API_KEY" | lkv --stdin

Tip: 'lkv' and 'llm-key-validator' are aliases for the same command.

Exit codes:
  0  all keys valid
  1  usage error
  2  one or more invalid
  3  unexpected error

Security:
  - Prefer --stdin or --env over passing keys on argv (shell history).
  - Validation calls hit live provider APIs and may count toward rate limits.
"""


def mask_key(key: str) -> str:
    if len(key) <= 12:
        return f"{key[:2]}...{key[-2:]}"
    return f"{key[:7]}...{key[-4:]}"


@dataclass
class _Color:
    use: bool

    def green(self, s: str) -> str:
        return f"\x1b[32m{s}\x1b[0m" if self.use else s

    def red(self, s: str) -> str:
        return f"\x1b[31m{s}\x1b[0m" if self.use else s

    def yellow(self, s: str) -> str:
        return f"\x1b[33m{s}\x1b[0m" if self.use else s

    def dim(self, s: str) -> str:
        return f"\x1b[2m{s}\x1b[0m" if self.use else s


_REASON_LABELS: dict[str, tuple[str, str]] = {
    "invalid_key": ("INVALID", "red"),
    "malformed_key": ("MALFORMED", "red"),
    "rate_limited": ("RATE LIMITED", "yellow"),
    "server_error": ("SERVER ERROR", "yellow"),
    "network_error": ("NETWORK ERROR", "yellow"),
    "timeout": ("TIMEOUT", "yellow"),
    "unknown_provider": ("UNKNOWN PROVIDER", "yellow"),
}

_LABEL_WIDTH = max(len("VALID"), *(len(t) for t, _ in _REASON_LABELS.values()))


def _format_result(key: str, r: ValidationResult, color: _Color) -> str:
    masked = color.dim(mask_key(key))
    if r.valid:
        meta = color.dim(f" {json.dumps(r.metadata)}") if r.metadata else ""
        return (
            f"{color.green('VALID'.ljust(_LABEL_WIDTH))}  "
            f"{r.provider.ljust(11)} {masked} "
            f"{color.dim(f'({r.latency_ms}ms)')}{meta}"
        )
    reason = r.reason or "invalid_key"
    label_text, label_color = _REASON_LABELS.get(reason, ("UNKNOWN", "yellow"))
    paint = getattr(color, label_color)
    message = r.message or ""
    return (
        f"{paint(label_text.ljust(_LABEL_WIDTH))}  "
        f"{r.provider.ljust(11)} {masked} "
        f"{color.dim(f'({r.latency_ms}ms)')} {color.dim(message)}"
    )


@dataclass
class _KeyEntry:
    key: str
    forced_provider: str | None
    source: str


def _collect_from_env(providers: list[Provider], env: Mapping[str, str]) -> list[_KeyEntry]:
    out: list[_KeyEntry] = []
    for p in providers:
        if not p.key_env_var:
            continue
        v = env.get(p.key_env_var)
        if v:
            out.append(_KeyEntry(key=v, forced_provider=p.name, source=p.key_env_var))
    return out


def _run_scan(
    args: _ParsedArgs,
    io: CliIO,
    color: _Color,
    http: HttpFn | None,
) -> int:
    files = args.positional if args.positional else [".env", ".env.local"]

    @dataclass
    class _ScanRow:
        file: str
        name: str
        line_number: int
        key: str
        result: ValidationResult

    rows: list[_ScanRow] = []
    any_file_read = False

    for file in files:
        content = io.read_file(file)
        if content is None:
            if args.positional:
                io.stderr(f"Error: cannot read {file}")
                return 1
            continue
        any_file_read = True
        entries = parse_env_file(content)
        for e in entries:
            result = validate_key(
                e.value,
                provider=args.provider,
                timeout_ms=args.timeout_ms,
                offline=args.offline,
                http=http,
            )
            rows.append(
                _ScanRow(
                    file=file, name=e.name, line_number=e.line_number, key=e.value, result=result
                )
            )

    if not any_file_read:
        io.stderr(f"Error: no .env files found. Tried: {', '.join(files)}")
        return 1

    if not rows:
        io.stdout("No API-key-like env vars found.")
        return 0

    filtered = [r for r in rows if not r.result.valid] if args.check_revoked else rows

    if args.json:
        payload = []
        for r in filtered:
            row = {
                "file": r.file,
                "name": r.name,
                "line": r.line_number,
                "key": mask_key(r.key),
            }
            row.update(r.result.to_dict())
            payload.append(row)
        io.stdout(json.dumps(payload, indent=2))
    else:
        current_file = ""
        for r in filtered:
            if r.file != current_file:
                if current_file:
                    io.stdout("")
                io.stdout(color.dim(f"{r.file}:"))
                current_file = r.file
            location = color.dim(f"L{r.line_number}")
            name = r.name.ljust(22)
            io.stdout(f"  {location}  {name}  {_format_result(r.key, r.result, color)}")

    return 2 if any(not r.result.valid for r in rows) else 0


def run_cli(argv: list[str], io: CliIO, *, http: HttpFn | None = None) -> int:
    """Run the CLI with an injectable IO surface and optional ``http`` for testing."""
    register_built_in_providers()
    color = _Color(use=io.stdout_is_tty and not io.env.get("NO_COLOR"))

    try:
        args = _parse_args(argv)
    except _UsageError as err:
        io.stderr(f"Error: {err}")
        io.stderr("")
        io.stderr(_help_text())
        return 1

    if args.show_help:
        io.stdout(_help_text())
        return 0
    if args.show_version:
        io.stdout(VERSION)
        return 0

    if args.list_providers:
        providers = list_providers()
        if args.json:
            io.stdout(
                json.dumps(
                    [
                        {
                            "name": p.name,
                            "displayName": p.display_name,
                            "keyEnvVar": p.key_env_var,
                        }
                        for p in providers
                    ],
                    indent=2,
                )
            )
        else:
            for p in providers:
                env_suffix = color.dim(f" ({p.key_env_var})") if p.key_env_var else ""
                io.stdout(f"{p.name.ljust(12)} {p.display_name}{env_suffix}")
        return 0

    all_providers = list_providers()

    if args.subcommand == "scan":
        return _run_scan(args, io, color, http)

    entries: list[_KeyEntry] = [
        _KeyEntry(key=k, forced_provider=args.provider, source="argv") for k in args.keys
    ]

    if args.stdin:
        if io.stdin_is_tty:
            io.stderr("Error: --stdin requires piped input. Pipe a key, or omit --stdin.")
            io.stderr("")
            return 1
        raw = io.read_stdin()
        for line in raw.replace("\r\n", "\n").split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                entries.append(_KeyEntry(key=line, forced_provider=args.provider, source="stdin"))

    if args.env:
        from_env = _collect_from_env(all_providers, io.env)
        if not from_env:
            io.stderr("Error: --env was set but no <PROVIDER>_API_KEY env vars were found.")
            io.stderr("Run --list-providers to see expected env var names.")
            io.stderr("")
            return 1
        entries.extend(from_env)

    if not entries and args.provider:
        forced = next((x for x in all_providers if x.name == args.provider), None)
        if forced and forced.key_env_var:
            v = io.env.get(forced.key_env_var)
            if v:
                entries.append(
                    _KeyEntry(key=v, forced_provider=forced.name, source=forced.key_env_var)
                )
        if not entries:
            env_name = forced.key_env_var if forced else "the provider env var"
            io.stderr(f"Error: no key supplied. Pass it as an arg, set {env_name}, or use --stdin.")
            io.stderr("")
            return 1

    if not entries:
        io.stderr("Error: provide at least one key, or use --stdin / --env.")
        io.stderr("")
        io.stderr(_help_text())
        return 1

    results: list[tuple[_KeyEntry, ValidationResult]] = []
    for e in entries:
        r = validate_key(
            e.key,
            provider=e.forced_provider,
            timeout_ms=args.timeout_ms,
            offline=args.offline,
            http=http,
        )
        results.append((e, r))

    if args.json:
        payload = []
        for entry, result in results:
            row = {"key": mask_key(entry.key), "source": entry.source}
            row.update(result.to_dict())
            payload.append(row)
        io.stdout(json.dumps(payload, indent=2))
    else:
        for entry, result in results:
            source_tag = color.dim(f" [{entry.source}]") if entry.source != "argv" else ""
            io.stdout(f"{_format_result(entry.key, result, color)}{source_tag}")

    return 2 if any(not r.valid for _, r in results) else 0


def _read_stdin_all() -> str:
    return sys.stdin.read()


def _read_file_or_none(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None


def main() -> None:
    io = CliIO(
        stdout=lambda line: print(line),
        stderr=lambda line: print(line, file=sys.stderr),
        env=os.environ,
        stdin_is_tty=sys.stdin.isatty(),
        stdout_is_tty=sys.stdout.isatty(),
        read_stdin=_read_stdin_all,
        read_file=_read_file_or_none,
    )
    try:
        code = run_cli(sys.argv[1:], io)
    except Exception as err:
        print(f"Unexpected error: {err}", file=sys.stderr)
        sys.exit(3)
    sys.exit(code)


if __name__ == "__main__":
    main()
