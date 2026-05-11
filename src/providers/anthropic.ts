import type { Provider } from "../core/types.js";

export const anthropic: Provider = {
  name: "anthropic",
  displayName: "Anthropic",
  keyEnvVar: "ANTHROPIC_API_KEY",
  detect: (key) => /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
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
