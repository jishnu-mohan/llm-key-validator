import type { Provider } from "../core/types.js";

export const fireworks: Provider = {
  name: "fireworks",
  displayName: "Fireworks AI",
  keyEnvVar: "FIREWORKS_API_KEY",
  detect: (key) => /^fw_[A-Za-z0-9]{20,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.fireworks.ai/inference/v1/models", {
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
