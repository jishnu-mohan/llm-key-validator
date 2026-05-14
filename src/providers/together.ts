import type { Provider } from "../core/types.js";

export const together: Provider = {
  name: "together",
  displayName: "Together AI",
  keyEnvVar: "TOGETHER_API_KEY",
  detect: (key) => /^[a-f0-9]{64}$/.test(key) || /^tgp_v\d_[A-Za-z0-9_-]{32,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (!res.ok) return { status: res.status, ok: false };
    const body = (await res.json().catch(() => null)) as unknown;
    const count = Array.isArray(body)
      ? body.length
      : Array.isArray((body as { data?: unknown[] })?.data)
        ? (body as { data: unknown[] }).data.length
        : 0;
    return {
      status: res.status,
      ok: true,
      metadata: { modelCount: count },
    };
  },
};
