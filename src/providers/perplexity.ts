import type { Provider } from "../core/types.js";

// Perplexity does not expose a `GET /models` endpoint, so we send a minimal
// chat request (1 token output) as the cheapest probe. The hardcoded model
// name below is a known stable identifier as of writing — if Perplexity
// renames or deprecates it, a valid key will return 400 and be mapped to
// `invalid_key`. Watch for that signal during dependency upkeep.
//
// API reference: https://docs.perplexity.ai/api-reference/chat-completions
const PROBE_MODEL = "sonar";

export const perplexity: Provider = {
  name: "perplexity",
  displayName: "Perplexity",
  keyEnvVar: "PERPLEXITY_API_KEY",
  detect: (key) => /^pplx-[A-Za-z0-9]{32,}$/.test(key),
  validate: async (key, { http, signal }) => {
    const res = await http("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PROBE_MODEL,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal,
    });
    return { status: res.status, ok: res.ok };
  },
};
