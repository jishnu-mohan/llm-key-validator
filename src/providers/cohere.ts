import type { Provider } from "../core/types.js";

export const cohere: Provider = {
  name: "cohere",
  displayName: "Cohere",
  keyEnvVar: "COHERE_API_KEY",
  detect: (key) => /^[A-Za-z0-9]{40}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.cohere.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (!res.ok) return { status: res.status, ok: false };
    const body = (await res.json().catch(() => ({}))) as { models?: unknown[] };
    return {
      status: res.status,
      ok: true,
      metadata: { modelCount: Array.isArray(body.models) ? body.models.length : 0 },
    };
  },
};
