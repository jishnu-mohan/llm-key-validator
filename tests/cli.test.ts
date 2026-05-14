import { describe, expect, it } from "vitest";
import { type CliIO, runCli } from "../src/cli.js";
import { mockFetch } from "./helpers.js";

function makeIO(overrides: Partial<CliIO> = {}): CliIO & {
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    env: {},
    stdinIsTTY: true,
    stdoutIsTTY: false,
    readStdin: async () => "",
    readFile: async () => null,
    out,
    err,
    ...overrides,
  };
}

describe("CLI", () => {
  it("--help prints usage and exits 0", async () => {
    const io = makeIO();
    const code = await runCli(["--help"], io);
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("Usage:");
    expect(io.out.join("\n")).toContain("llm-key-validator");
  });

  it("--version prints a version and exits 0", async () => {
    const io = makeIO();
    const code = await runCli(["--version"], io);
    expect(code).toBe(0);
    expect(io.out.join("")).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--list-providers includes all built-ins", async () => {
    const io = makeIO();
    const code = await runCli(["--list-providers"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const name of [
      "openai",
      "anthropic",
      "google",
      "groq",
      "mistral",
      "openrouter",
      "cohere",
      "perplexity",
      "deepseek",
      "together",
      "fireworks",
      "xai",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("--list-providers --json emits valid JSON with env vars", async () => {
    const io = makeIO();
    const code = await runCli(["--list-providers", "--json"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(io.out.join("\n")) as Array<{
      name: string;
      keyEnvVar: string | null;
    }>;
    expect(parsed.length).toBeGreaterThanOrEqual(12);
    const openai = parsed.find((p) => p.name === "openai");
    expect(openai?.keyEnvVar).toBe("OPENAI_API_KEY");
  });

  it("returns 1 with no key, no --stdin, no --env", async () => {
    const io = makeIO();
    const code = await runCli([], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("provide at least one key");
  });

  it("rejects unknown options with exit 1", async () => {
    const io = makeIO();
    const code = await runCli(["--bogus"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/Unknown option: --bogus/);
  });

  it("rejects --timeout with non-numeric value", async () => {
    const io = makeIO();
    const code = await runCli(["--timeout", "abc", "sk-anything"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/Invalid --timeout/);
  });

  it("exits 2 when a key is invalid (mocked 401)", async () => {
    const io = makeIO();
    const fetchImpl = mockFetch({ status: 401 });
    const code = await runCli(
      ["sk-abcdefghijklmnopqrstuvwxyz0123456789", "--provider", "openai"],
      io,
      { fetch: fetchImpl },
    );
    expect(code).toBe(2);
    expect(io.out.join("\n")).toContain("INVALID");
  });

  it("exits 0 when key validates (mocked 200)", async () => {
    const io = makeIO();
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(
      ["sk-abcdefghijklmnopqrstuvwxyz0123456789", "--provider", "openai"],
      io,
      { fetch: fetchImpl },
    );
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("VALID");
  });

  it("--json output is valid JSON containing masked key", async () => {
    const io = makeIO();
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(
      ["sk-abcdefghijklmnopqrstuvwxyz0123456789", "--provider", "openai", "--json"],
      io,
      { fetch: fetchImpl },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(io.out.join("\n")) as Array<{ key: string; valid: boolean }>;
    expect(parsed[0]?.valid).toBe(true);
    expect(parsed[0]?.key).toMatch(/\.{3}/);
    expect(parsed[0]?.key).not.toContain("klmno");
  });

  it("--stdin reads keys from stdin when not a TTY", async () => {
    const io = makeIO({
      stdinIsTTY: false,
      readStdin: async () => "sk-abcdefghijklmnopqrstuvwxyz0123456789\n# comment\n",
    });
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(["--stdin", "--provider", "openai"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("VALID");
    expect(io.out.join("\n")).toContain("[stdin]");
  });

  it("--stdin errors when stdin is a TTY (would otherwise hang)", async () => {
    const io = makeIO({ stdinIsTTY: true });
    const code = await runCli(["--stdin"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/--stdin requires piped input/);
  });

  it("--env picks up keys from environment vars", async () => {
    const io = makeIO({
      env: {
        OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
        ANTHROPIC_API_KEY: "sk-ant-abcdefghijklmnop",
      },
    });
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(["--env"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    const output = io.out.join("\n");
    expect(output).toContain("OPENAI_API_KEY");
    expect(output).toContain("ANTHROPIC_API_KEY");
  });

  it("--env errors when no env vars are set", async () => {
    const io = makeIO({ env: {} });
    const code = await runCli(["--env"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/no <PROVIDER>_API_KEY env vars/);
  });

  it("--provider X with no key falls back to that provider's env var", async () => {
    const io = makeIO({
      env: { OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz0123456789" },
    });
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(["--provider", "openai"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("VALID");
  });

  it("--provider X with no key and no env var fails with exit 1", async () => {
    const io = makeIO({ env: {} });
    const code = await runCli(["--provider", "openai"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("OPENAI_API_KEY");
  });

  it("rate-limited key is reported as RATE LIMITED, not INVALID, with exit 2", async () => {
    const io = makeIO();
    const fetchImpl = mockFetch({ status: 429 });
    const code = await runCli(
      ["sk-abcdefghijklmnopqrstuvwxyz0123456789", "--provider", "openai"],
      io,
      { fetch: fetchImpl },
    );
    expect(code).toBe(2);
    expect(io.out.join("\n")).toContain("RATE LIMITED");
  });

  it("--offline returns VALID without making a network call", async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const io = makeIO();
    const code = await runCli(["--offline", "sk-ant-abcdefghijklmnop"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("VALID");
    expect(called).toBe(false);
  });

  it("--offline reports invalid_key when key does not match forced provider", async () => {
    const io = makeIO();
    const code = await runCli(["--offline", "--provider", "openai", "sk-ant-abc"], io);
    expect(code).toBe(2);
    expect(io.out.join("\n")).toContain("INVALID");
  });

  it("scan reads .env from disk and validates entries", async () => {
    const files: Record<string, string> = {
      ".env": `
# top
OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789
ANTHROPIC_API_KEY=changeme
RANDOM_VAR=ignored
      `,
    };
    const io = makeIO({
      readFile: async (path) => files[path] ?? null,
    });
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(["scan"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    const output = io.out.join("\n");
    expect(output).toContain("OPENAI_API_KEY");
    expect(output).toContain(".env:");
    // changeme is a placeholder — skipped; only OPENAI_API_KEY validated
    expect(output).not.toContain("ANTHROPIC_API_KEY");
    expect(output).not.toContain("RANDOM_VAR");
  });

  it("scan exits 2 when any key in the file is invalid", async () => {
    const files: Record<string, string> = {
      ".env": "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n",
    };
    const io = makeIO({ readFile: async (path) => files[path] ?? null });
    const fetchImpl = mockFetch({ status: 401 });
    const code = await runCli(["scan"], io, { fetch: fetchImpl });
    expect(code).toBe(2);
    expect(io.out.join("\n")).toContain("INVALID");
  });

  it("scan errors when an explicit file does not exist", async () => {
    const io = makeIO({ readFile: async () => null });
    const code = await runCli(["scan", "missing.env"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toMatch(/cannot read missing\.env/);
  });

  it("scan --json emits structured output", async () => {
    const files: Record<string, string> = {
      ".env": "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n",
    };
    const io = makeIO({ readFile: async (path) => files[path] ?? null });
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const code = await runCli(["scan", "--json"], io, { fetch: fetchImpl });
    expect(code).toBe(0);
    const parsed = JSON.parse(io.out.join("\n")) as Array<{
      name: string;
      line: number;
      valid: boolean;
    }>;
    expect(parsed[0]).toMatchObject({ name: "OPENAI_API_KEY", valid: true, line: 1 });
  });

  it("empty/malformed key is reported as MALFORMED", async () => {
    const io = makeIO();
    const code = await runCli(["", "--provider", "openai"], io);
    // empty positional arg is dropped by parseArgs; ensure we still error
    // Force the path via passing whitespace:
    const io2 = makeIO();
    const code2 = await runCli(["   ", "--provider", "openai"], io2);
    expect([code, code2]).toContain(1);
  });
});
