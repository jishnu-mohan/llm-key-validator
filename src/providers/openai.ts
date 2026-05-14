import type { Provider } from "../core/types.js";

export const openai: Provider = {
  name: "openai",
  displayName: "OpenAI",
  keyEnvVar: "OPENAI_API_KEY",
  // Exclude sk-ant- (Anthropic) and sk-or- (OpenRouter) so offline-mode + scoped detection are unambiguous.
  detect: (key) => /^sk-(?!ant-|or-)[A-Za-z0-9_-]{16,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (!res.ok) return { status: res.status, ok: false };
    const body = (await res.json().catch(() => ({}))) as { data?: unknown[] };
    return {
      status: res.status,
      ok: true,
      metadata: { modelCount: Array.isArray(body.data) ? body.data.length : 0 },
    };
  },
};
