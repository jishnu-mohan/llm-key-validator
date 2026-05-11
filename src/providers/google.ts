import type { Provider } from "../core/types.js";

export const google: Provider = {
  name: "google",
  displayName: "Google (Gemini)",
  keyEnvVar: "GOOGLE_API_KEY",
  detect: (key) => /^AIza[A-Za-z0-9_-]{30,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const res = await http(url, { signal });
    if (!res.ok) return { status: res.status, ok: false };
    const body = (await res.json().catch(() => ({}))) as { models?: unknown[] };
    return {
      status: res.status,
      ok: true,
      metadata: { modelCount: Array.isArray(body.models) ? body.models.length : 0 },
    };
  },
};
