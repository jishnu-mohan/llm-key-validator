// Cloudflare Worker example: POST /validate { key: "sk-..." } → ValidationResult.
// Deploy with `wrangler publish`. Bring your own bundler config.
//
// import { validateKey } from "llm-key-validator/core";
// import { openai, anthropic, google } from "llm-key-validator/providers";

import { validateKey } from "../src/core/index.js";
import { anthropic, google, openai } from "../src/providers/standalone.js";

// No bindings needed for this example. Add WORKER_API_KEY here if you want
// to protect this endpoint.
type Env = Record<string, never>;

export default {
  async fetch(req: Request, _env: Env): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("POST /validate { key }", { status: 405 });
    }

    let body: { key?: string; provider?: string };
    try {
      body = (await req.json()) as { key?: string; provider?: string };
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }

    if (!body.key) {
      return Response.json({ error: "key is required" }, { status: 400 });
    }

    const result = await validateKey(body.key, {
      provider: body.provider,
      providers: [openai, anthropic, google],
      timeoutMs: 5_000,
    });

    return Response.json(result, {
      status: result.valid ? 200 : 401,
    });
  },
};
