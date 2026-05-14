import { describe, expect, it } from "vitest";
import type { Provider } from "../src/core/types.js";
import {
  anthropic,
  cohere,
  deepseek,
  fireworks,
  google,
  groq,
  mistral,
  openai,
  openrouter,
  perplexity,
  together,
  xai,
} from "../src/providers/index.js";
import { mockFetch } from "./helpers.js";

const cases: { provider: Provider; sampleKey: string; expectedHost: string }[] = [
  {
    provider: openai,
    sampleKey: "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
    expectedHost: "api.openai.com",
  },
  {
    provider: anthropic,
    sampleKey: "sk-ant-abcdefghijklmnopqrstuvwxyz",
    expectedHost: "api.anthropic.com",
  },
  {
    provider: google,
    sampleKey: "AIzaSyA0123456789abcdefghijklmnopqrstuv",
    expectedHost: "generativelanguage.googleapis.com",
  },
  {
    provider: groq,
    sampleKey: "gsk_abcdefghijklmnopqrstuvwxyz",
    expectedHost: "api.groq.com",
  },
  {
    provider: mistral,
    sampleKey: "abcdefghijklmnopqrstuvwxyz012345",
    expectedHost: "api.mistral.ai",
  },
  {
    provider: openrouter,
    sampleKey: "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789",
    expectedHost: "openrouter.ai",
  },
  {
    provider: cohere,
    sampleKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    expectedHost: "api.cohere.com",
  },
  {
    provider: perplexity,
    sampleKey: "pplx-abcdefghijklmnopqrstuvwxyz012345",
    expectedHost: "api.perplexity.ai",
  },
  {
    provider: deepseek,
    sampleKey: "sk-0123456789abcdef0123456789abcdef",
    expectedHost: "api.deepseek.com",
  },
  {
    provider: together,
    sampleKey: "a".repeat(64),
    expectedHost: "api.together.xyz",
  },
  {
    provider: fireworks,
    sampleKey: "fw_abcdefghijklmnopqrstuvwxyz",
    expectedHost: "api.fireworks.ai",
  },
  {
    provider: xai,
    sampleKey: "xai-abcdefghijklmnopqrstuvwxyz012345",
    expectedHost: "api.x.ai",
  },
];

describe.each(cases)("provider $provider.name", ({ provider, sampleKey, expectedHost }) => {
  it("detect() matches sample key", () => {
    expect(provider.detect(sampleKey)).toBe(true);
  });

  it("hits the expected host on success", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    const controller = new AbortController();
    const res = await provider.validate(sampleKey, {
      http: fetchImpl,
      signal: controller.signal,
    });
    expect(res.ok).toBe(true);
    expect(fetchImpl.calls[0]?.url).toContain(expectedHost);
  });

  it("returns ok=false on 401", async () => {
    const fetchImpl = mockFetch({ status: 401 });
    const controller = new AbortController();
    const res = await provider.validate(sampleKey, {
      http: fetchImpl,
      signal: controller.signal,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});

describe("auth header shape", () => {
  it("OpenAI uses Bearer auth", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    await openai.validate("sk-abcdefghijklmnopqrstuvwxyz0123456789", {
      http: fetchImpl,
      signal: new AbortController().signal,
    });
    const headers = (fetchImpl.calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer sk-/);
  });

  it("Anthropic uses x-api-key and version", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { data: [] } });
    await anthropic.validate("sk-ant-abcdefghijklmnop", {
      http: fetchImpl,
      signal: new AbortController().signal,
    });
    const headers = (fetchImpl.calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toMatch(/^sk-ant-/);
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("Google puts the key in the query string, not headers", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { models: [] } });
    await google.validate("AIzaSyA0123456789abcdefghijklmnopqrstuv", {
      http: fetchImpl,
      signal: new AbortController().signal,
    });
    expect(fetchImpl.calls[0]?.url).toContain("key=AIza");
  });

  it("Perplexity makes a POST request", async () => {
    const fetchImpl = mockFetch({ status: 200, body: {} });
    await perplexity.validate("pplx-abcdefghijklmnopqrstuvwxyz012345", {
      http: fetchImpl,
      signal: new AbortController().signal,
    });
    expect(fetchImpl.calls[0]?.init?.method).toBe("POST");
  });
});

describe("OpenAI key format variants", () => {
  it.each([
    ["sk-classic", "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF"],
    ["sk-proj- (project key)", "sk-proj-abcdefghij_klmnop-qrstuv0123456789ABCDEF"],
    ["sk-svcacct- (service account)", "sk-svcacct-abcdefghijklmnop0123456789ABCDEF"],
    ["sk-admin- (admin key)", "sk-admin-abcdefghijklmnop0123456789ABCDEF"],
  ])("detect() matches %s", (_label, key) => {
    expect(openai.detect(key)).toBe(true);
  });

  it.each([
    ["sk-ant- (Anthropic)", "sk-ant-abcdefghijklmnopqrstuvwxyz"],
    ["sk-or- (OpenRouter)", "sk-or-v1-abcdefghijklmnopqrstuvwxyz01234"],
    ["bare prefix too short", "sk-abc"],
  ])("detect() rejects %s", (_label, key) => {
    expect(openai.detect(key)).toBe(false);
  });
});
