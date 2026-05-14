import type { Provider } from "../core/types.js";

export const xai: Provider = {
  name: "xai",
  displayName: "xAI (Grok)",
  keyEnvVar: "XAI_API_KEY",
  detect: (key) => /^xai-[A-Za-z0-9]{32,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.x.ai/v1/models", {
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
