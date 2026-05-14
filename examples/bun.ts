// Bun smoke test: `bun examples/bun.ts $OPENAI_API_KEY`
//
// import { validateKey } from "llm-key-validator/core";
// import { openai, anthropic } from "llm-key-validator/providers";

import { validateKey } from "../src/core/index.js";
import { anthropic, openai } from "../src/providers/standalone.js";

const key = process.argv[2] ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;

if (!key) {
  console.error("usage: bun examples/bun.ts <key>");
  console.error("       (or set OPENAI_API_KEY / ANTHROPIC_API_KEY in env)");
  process.exit(1);
}

const result = await validateKey(key, {
  providers: [openai, anthropic],
  timeoutMs: 5_000,
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 2);
