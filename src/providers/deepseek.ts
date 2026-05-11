import type { Provider } from "../core/types.js";

export const deepseek: Provider = {
  name: "deepseek",
  displayName: "DeepSeek",
  keyEnvVar: "DEEPSEEK_API_KEY",
  detect: (key) => /^sk-[a-f0-9]{32}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.deepseek.com/models", {
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
