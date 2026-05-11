import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  detectProvider,
  listProviders,
  registerProvider,
  unregisterProvider,
} from "../src/core/registry.js";
import type { Provider } from "../src/core/types.js";
import { normalizeKey, validateKey, validateKeys } from "../src/core/validate.js";
import { registerBuiltInProviders } from "../src/providers/index.js";
import { mockFetch } from "./helpers.js";

beforeAll(() => {
  registerBuiltInProviders();
});

describe("normalizeKey", () => {
  it("trims whitespace and newlines", () => {
    expect(normalizeKey("  sk-foo  \n")).toBe("sk-foo");
  });
  it("strips surrounding quotes", () => {
    expect(normalizeKey('"sk-foo"')).toBe("sk-foo");
    expect(normalizeKey("'sk-foo'")).toBe("sk-foo");
  });
  it("returns empty string for non-strings", () => {
    expect(normalizeKey(undefined)).toBe("");
    expect(normalizeKey(null)).toBe("");
    expect(normalizeKey(42)).toBe("");
  });
});

describe("validateKey", () => {
  it("returns malformed_key for empty key", async () => {
    const r = await validateKey("");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("malformed_key");
  });

  it("returns unknown_provider when detection fails", async () => {
    const r = await validateKey("garbage-no-prefix-match");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("unknown_provider");
  });

  it("returns unknown_provider when forced provider does not exist", async () => {
    const r = await validateKey("sk-anything", { provider: "no-such-provider" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("unknown_provider");
  });

  it("validates a key via mocked fetch (success)", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [{ id: "gpt-4o" }] } });
    const r = await validateKey("sk-abcdefghijklmnopqrstuvwxyz0123456789", {
      provider: "openai",
      fetch: fetchImpl,
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.metadata).toEqual({ modelCount: 1 });
  });

  it("maps 401 to invalid_key", async () => {
    const fetchImpl = mockFetch({ status: 401 });
    const r = await validateKey("sk-abcdefghijklmnopqrstuvwxyz0123456789", {
      provider: "openai",
      fetch: fetchImpl,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.reason).toBe("invalid_key");
      expect(r.status).toBe(401);
    }
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = mockFetch({ status: 429 });
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      fetch: fetchImpl,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("rate_limited");
  });

  it("maps 5xx to server_error after retries", async () => {
    const fetchImpl = mockFetch([{ status: 500 }, { status: 500 }]);
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      fetch: fetchImpl,
      retries: 1,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("server_error");
  });

  it("maps TypeError to network_error", async () => {
    const fetchImpl = mockFetch({ throw: new TypeError("fetch failed") });
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      fetch: fetchImpl,
      retries: 0,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("network_error");
  });

  it("maps timeout to timeout", async () => {
    const fetchImpl = mockFetch({ delay: 200 });
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      fetch: fetchImpl,
      timeoutMs: 20,
      retries: 0,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("timeout");
  });

  it("includes latency in result", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      fetch: fetchImpl,
    });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("validateKeys (bulk)", () => {
  it("validates many keys in parallel", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const r = await validateKeys(["sk-ant-abcdefghijklmnop", "sk-ant-zzzzzzzzzzzzzzzz"], {
      provider: "anthropic",
      fetch: fetchImpl,
    });
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.valid)).toBe(true);
  });
});

describe("registry detection", () => {
  it("detects anthropic before openai for sk-ant- keys", () => {
    const p = detectProvider("sk-ant-abcdefghijklmnop");
    expect(p?.name).toBe("anthropic");
  });

  it("detects openrouter for sk-or- keys", () => {
    const p = detectProvider("sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789");
    expect(p?.name).toBe("openrouter");
  });

  it("detects google for AIza... keys", () => {
    const p = detectProvider("AIzaSyA0123456789abcdefghijklmnopqrstuv");
    expect(p?.name).toBe("google");
  });

  it("detects groq for gsk_ keys", () => {
    const p = detectProvider("gsk_abcdefghijklmnopqrstuvwxyz");
    expect(p?.name).toBe("groq");
  });

  it("lists all built-in providers", () => {
    const names = listProviders().map((p) => p.name);
    for (const expected of [
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
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe("offline mode", () => {
  it("returns valid: true for a matching key without network", async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      offline: true,
      fetch: fetchImpl,
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.metadata).toEqual({ offline: true });
    expect(called).toBe(false);
  });

  it("returns invalid_key when key does not match the forced provider", async () => {
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "openai",
      offline: true,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("invalid_key");
  });

  it("returns unknown_provider in offline mode when nothing detects", async () => {
    const r = await validateKey("garbage-prefix-no-match", { offline: true });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("unknown_provider");
  });
});

describe("scoped providers", () => {
  it("auto-detects only within the scoped list", async () => {
    const { openai } = await import("../src/providers/standalone.js");
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const r = await validateKey("sk-abcdefghijklmnopqrstuvwxyz0123456789", {
      providers: [openai],
      fetch: fetchImpl,
    });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.provider).toBe("openai");
  });

  it("scoped detection ignores providers not in the list", async () => {
    const { openai } = await import("../src/providers/standalone.js");
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      providers: [openai],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("unknown_provider");
  });

  it("forced provider with scoped list errors if not in the list", async () => {
    const { openai } = await import("../src/providers/standalone.js");
    const r = await validateKey("sk-ant-abcdefghijklmnop", {
      provider: "anthropic",
      providers: [openai],
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("unknown_provider");
  });
});

describe("custom provider registration", () => {
  afterEach(() => {
    unregisterProvider("custom-test");
  });

  it("can register and use a custom provider", async () => {
    const custom: Provider = {
      name: "custom-test",
      displayName: "Custom Test",
      detect: (k) => k.startsWith("ct_"),
      validate: async () => ({ status: 200, ok: true, metadata: { hello: "world" } }),
    };
    registerProvider(custom);

    const r = await validateKey("ct_abc123");
    expect(r.valid).toBe(true);
    expect(r.provider).toBe("custom-test");
    if (r.valid) expect(r.metadata).toEqual({ hello: "world" });
  });
});
