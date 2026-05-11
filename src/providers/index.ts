import { registerProvider } from "../core/registry.js";
import type { Provider } from "../core/types.js";
import { anthropic } from "./anthropic.js";
import { cohere } from "./cohere.js";
import { deepseek } from "./deepseek.js";
import { fireworks } from "./fireworks.js";
import { google } from "./google.js";
import { groq } from "./groq.js";
import { mistral } from "./mistral.js";
import { openai } from "./openai.js";
import { openrouter } from "./openrouter.js";
import { perplexity } from "./perplexity.js";
import { together } from "./together.js";
import { xai } from "./xai.js";

export {
  anthropic,
  cohere,
  deepseek,
  fireworks,
  google,
  groq,
  mistral,
  openai,
  openrouter,
  perplexity,
  together,
  xai,
};

// Registration order matters: more-specific prefixes first so they win in auto-detect.
export const builtInProviders: Provider[] = [
  anthropic, // sk-ant-
  openrouter, // sk-or-
  deepseek, // sk-<32 hex>
  openai, // sk-... (catch-all for OpenAI-style)
  google, // AIza...
  groq, // gsk_...
  xai, // xai-...
  fireworks, // fw_...
  perplexity, // pplx-...
  together, // 64 hex or tgp_v1_...
  cohere, // 40 alnum
  mistral, // 32 alnum
];

let registered = false;

/**
 * Register all built-in providers in the global registry.
 *
 * Idempotent — safe to call multiple times. The main entry (`llm-key-validator`)
 * and the CLI bin both call this explicitly; do not rely on import-time side
 * effects, since tree-shaking aggressively drops them.
 */
export function registerBuiltInProviders(): void {
  if (registered) return;
  for (const p of builtInProviders) registerProvider(p);
  registered = true;
}
