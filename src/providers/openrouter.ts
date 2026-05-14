import type { Provider } from "../core/types.js";

export const openrouter: Provider = {
  name: "openrouter",
  displayName: "OpenRouter",
  keyEnvVar: "OPENROUTER_API_KEY",
  detect: (key) => /^sk-or-(v\d-)?[A-Za-z0-9]{32,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (!res.ok) return { status: res.status, ok: false };
    const body = (await res.json().catch(() => ({}))) as {
      data?: { label?: string; usage?: number; limit?: number | null };
    };
    return {
      status: res.status,
      ok: true,
      metadata: body.data
        ? { label: body.data.label, usage: body.data.usage, limit: body.data.limit }
        : undefined,
    };
  },
};
