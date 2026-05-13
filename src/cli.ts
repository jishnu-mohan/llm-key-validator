import { listProviders } from "./core/registry.js";
import { parseEnvFile } from "./core/scan.js";
import type { Provider, ValidationFailureReason, ValidationResult } from "./core/types.js";
import { validateKey } from "./core/validate.js";
import { registerBuiltInProviders } from "./providers/index.js";
import { VERSION } from "./version.js";

registerBuiltInProviders();

export interface CliIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: NodeJS.ProcessEnv;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  readStdin: () => Promise<string>;
  /** Read a UTF-8 file. Returns `null` if the file does not exist. */
  readFile: (path: string) => Promise<string | null>;
}

export interface CliOptions {
  fetch?: typeof fetch;
}

interface ParsedArgs {
  subcommand?: "scan";
  positional: string[];
  keys: string[];
  provider?: string;
  json: boolean;
  stdin: boolean;
  env: boolean;
  offline: boolean;
  checkRevoked: boolean;
  timeoutMs?: number;
  listProviders: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    positional: [],
    keys: [],
    json: false,
    stdin: false,
    env: false,
    offline: false,
    checkRevoked: false,
    listProviders: false,
    showHelp: false,
    showVersion: false,
  };

  let argList = argv;
  if (argList[0] === "scan") {
    args.subcommand = "scan";
    argList = argList.slice(1);
  }

  for (let i = 0; i < argList.length; i++) {
    const a = argList[i];
    switch (a) {
      case "-h":
      case "--help":
        args.showHelp = true;
        break;
      case "-v":
      case "--version":
        args.showVersion = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--stdin":
        args.stdin = true;
        break;
      case "--env":
        args.env = true;
        break;
      case "--offline":
        args.offline = true;
        break;
      case "--check-revoked":
        args.checkRevoked = true;
        break;
      case "--list-providers":
        args.listProviders = true;
        break;
      case "-p":
      case "--provider": {
        const v = argList[++i];
        if (!v) throw new Error("--provider requires a value");
        args.provider = v;
        break;
      }
      case "--timeout": {
        const v = argList[++i];
        if (!v) throw new Error("--timeout requires a value (ms)");
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --timeout: ${v}`);
        args.timeoutMs = n;
        break;
      }
      default:
        if (a?.startsWith("-")) throw new Error(`Unknown option: ${a}`);
        if (a) {
          args.positional.push(a);
          args.keys.push(a);
        }
    }
  }
  return args;
}

function helpText(): string {
  return `llm-key-validator v${VERSION}  (alias: lkv)

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
     Use 'npx llm-key-validator ...' for one-shots without installing.

Exit codes:
  0  all keys valid
  1  usage error
  2  one or more invalid
  3  unexpected error

Security:
  - Prefer --stdin or --env over passing keys on argv (shell history).
  - Validation calls hit live provider APIs and may count toward rate limits.
`;
}

export function maskKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 2)}...${key.slice(-2)}`;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function makeColor(useColor: boolean) {
  return {
    green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
    red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
    yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
    dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  };
}

const REASON_LABELS: Record<ValidationFailureReason, { text: string; color: "red" | "yellow" }> = {
  invalid_key: { text: "INVALID", color: "red" },
  malformed_key: { text: "MALFORMED", color: "red" },
  rate_limited: { text: "RATE LIMITED", color: "yellow" },
  server_error: { text: "SERVER ERROR", color: "yellow" },
  network_error: { text: "NETWORK ERROR", color: "yellow" },
  timeout: { text: "TIMEOUT", color: "yellow" },
  unknown_provider: { text: "UNKNOWN PROVIDER", color: "yellow" },
};

const LABEL_WIDTH = Math.max(
  "VALID".length,
  ...Object.values(REASON_LABELS).map((l) => l.text.length),
);

function formatResult(
  key: string,
  r: ValidationResult,
  color: ReturnType<typeof makeColor>,
): string {
  const masked = color.dim(maskKey(key));
  if (r.valid) {
    const meta = r.metadata ? color.dim(` ${JSON.stringify(r.metadata)}`) : "";
    return `${color.green("VALID".padEnd(LABEL_WIDTH))}  ${r.provider.padEnd(11)} ${masked} ${color.dim(`(${r.latencyMs}ms)`)}${meta}`;
  }
  const label = REASON_LABELS[r.reason];
  const paint = color[label.color];
  return `${paint(label.text.padEnd(LABEL_WIDTH))}  ${r.provider.padEnd(11)} ${masked} ${color.dim(`(${r.latencyMs}ms)`)} ${color.dim(r.message)}`;
}

interface KeyEntry {
  key: string;
  forcedProvider?: string;
  source: string;
}

async function runScan(
  args: ParsedArgs,
  io: CliIO,
  color: ReturnType<typeof makeColor>,
  options: CliOptions,
): Promise<number> {
  const files = args.positional.length > 0 ? args.positional : [".env", ".env.local"];

  interface ScanRow {
    file: string;
    name: string;
    lineNumber: number;
    key: string;
    result: ValidationResult;
  }
  const rows: ScanRow[] = [];
  let anyFileRead = false;

  for (const file of files) {
    const content = await io.readFile(file);
    if (content === null) {
      if (args.positional.length > 0) {
        io.stderr(`Error: cannot read ${file}`);
        return 1;
      }
      continue;
    }
    anyFileRead = true;
    const entries = parseEnvFile(content);
    const fileResults = await Promise.all(
      entries.map(async (e) => {
        const result = await validateKey(e.value, {
          provider: args.provider,
          timeoutMs: args.timeoutMs,
          offline: args.offline,
          fetch: options.fetch,
        });
        return { file, name: e.name, lineNumber: e.lineNumber, key: e.value, result } as ScanRow;
      }),
    );
    rows.push(...fileResults);
  }

  if (!anyFileRead) {
    io.stderr(`Error: no .env files found. Tried: ${files.join(", ")}`);
    return 1;
  }

  if (rows.length === 0) {
    io.stdout("No API-key-like env vars found.");
    return 0;
  }

  const filtered = args.checkRevoked ? rows.filter((r) => !r.result.valid) : rows;

  if (args.json) {
    io.stdout(
      JSON.stringify(
        filtered.map((r) => ({
          file: r.file,
          name: r.name,
          line: r.lineNumber,
          key: maskKey(r.key),
          ...r.result,
        })),
        null,
        2,
      ),
    );
  } else {
    let currentFile = "";
    for (const r of filtered) {
      if (r.file !== currentFile) {
        if (currentFile !== "") io.stdout("");
        io.stdout(color.dim(`${r.file}:`));
        currentFile = r.file;
      }
      const location = color.dim(`L${r.lineNumber}`);
      const name = r.name.padEnd(22);
      io.stdout(`  ${location}  ${name}  ${formatResult(r.key, r.result, color)}`);
    }
  }

  const anyInvalid = rows.some((r) => !r.result.valid);
  return anyInvalid ? 2 : 0;
}

function collectFromEnv(providers: Provider[], env: NodeJS.ProcessEnv): KeyEntry[] {
  const entries: KeyEntry[] = [];
  for (const p of providers) {
    if (!p.keyEnvVar) continue;
    const value = env[p.keyEnvVar];
    if (value && value.length > 0) {
      entries.push({ key: value, forcedProvider: p.name, source: p.keyEnvVar });
    }
  }
  return entries;
}

export async function runCli(argv: string[], io: CliIO, options: CliOptions = {}): Promise<number> {
  const color = makeColor(io.stdoutIsTTY && !io.env.NO_COLOR);

  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    io.stderr(`Error: ${(err as Error).message}`);
    io.stderr("");
    io.stderr(helpText());
    return 1;
  }

  if (args.showHelp) {
    io.stdout(helpText());
    return 0;
  }
  if (args.showVersion) {
    io.stdout(VERSION);
    return 0;
  }
  if (args.listProviders) {
    const providers = listProviders();
    if (args.json) {
      io.stdout(
        JSON.stringify(
          providers.map((p) => ({
            name: p.name,
            displayName: p.displayName,
            keyEnvVar: p.keyEnvVar ?? null,
          })),
          null,
          2,
        ),
      );
    } else {
      for (const p of providers) {
        const env = p.keyEnvVar ? color.dim(` (${p.keyEnvVar})`) : "";
        io.stdout(`${p.name.padEnd(12)} ${p.displayName}${env}`);
      }
    }
    return 0;
  }

  const allProviders = listProviders();

  if (args.subcommand === "scan") {
    return runScan(args, io, color, options);
  }

  const entries: KeyEntry[] = args.keys.map((k) => ({
    key: k,
    forcedProvider: args.provider,
    source: "argv",
  }));

  if (args.stdin) {
    if (io.stdinIsTTY) {
      io.stderr("Error: --stdin requires piped input. Pipe a key, or omit --stdin.");
      io.stderr("");
      return 1;
    }
    const raw = await io.readStdin();
    const stdinKeys = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    for (const k of stdinKeys) {
      entries.push({ key: k, forcedProvider: args.provider, source: "stdin" });
    }
  }

  if (args.env) {
    const fromEnv = collectFromEnv(allProviders, io.env);
    if (fromEnv.length === 0) {
      io.stderr("Error: --env was set but no <PROVIDER>_API_KEY env vars were found.");
      io.stderr("Run --list-providers to see expected env var names.");
      io.stderr("");
      return 1;
    }
    entries.push(...fromEnv);
  }

  if (entries.length === 0 && args.provider) {
    const p = allProviders.find((x) => x.name === args.provider);
    if (p?.keyEnvVar) {
      const v = io.env[p.keyEnvVar];
      if (v && v.length > 0) {
        entries.push({ key: v, forcedProvider: p.name, source: p.keyEnvVar });
      }
    }
    if (entries.length === 0) {
      io.stderr(
        `Error: no key supplied. Pass it as an arg, set ${p?.keyEnvVar ?? "the provider env var"}, or use --stdin.`,
      );
      io.stderr("");
      return 1;
    }
  }

  if (entries.length === 0) {
    io.stderr("Error: provide at least one key, or use --stdin / --env.");
    io.stderr("");
    io.stderr(helpText());
    return 1;
  }

  const results = await Promise.all(
    entries.map((e) =>
      validateKey(e.key, {
        provider: e.forcedProvider,
        timeoutMs: args.timeoutMs,
        offline: args.offline,
        fetch: options.fetch,
      }).then((r) => ({ entry: e, result: r })),
    ),
  );

  if (args.json) {
    io.stdout(
      JSON.stringify(
        results.map(({ entry, result }) => ({
          key: maskKey(entry.key),
          source: entry.source,
          ...result,
        })),
        null,
        2,
      ),
    );
  } else {
    for (const { entry, result } of results) {
      const sourceTag = entry.source !== "argv" ? color.dim(` [${entry.source}]`) : "";
      io.stdout(`${formatResult(entry.key, result, color)}${sourceTag}`);
    }
  }

  const anyInvalid = results.some((r) => !r.result.valid);
  return anyInvalid ? 2 : 0;
}
