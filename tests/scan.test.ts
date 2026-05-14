import { describe, expect, it } from "vitest";
import { parseEnvFile } from "../src/core/scan.js";

describe("parseEnvFile", () => {
  it("extracts API_KEY entries", () => {
    const out = parseEnvFile(`
OPENAI_API_KEY=sk-real-key-value
ANTHROPIC_API_KEY="sk-ant-quoted"
FOO=bar
`);
    expect(out.map((e) => e.name)).toEqual(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);
    expect(out.find((e) => e.name === "OPENAI_API_KEY")?.value).toBe("sk-real-key-value");
    expect(out.find((e) => e.name === "ANTHROPIC_API_KEY")?.value).toBe("sk-ant-quoted");
  });

  it("recognizes _KEY, _TOKEN, _SECRET suffixes", () => {
    const out = parseEnvFile(`
SOME_API_KEY=a
OAUTH_TOKEN=b
HMAC_SECRET=c
SOMETHING_KEY=d
RANDOM_VAR=should-not-match
`);
    expect(out.map((e) => e.name).sort()).toEqual(
      ["HMAC_SECRET", "OAUTH_TOKEN", "SOMETHING_KEY", "SOME_API_KEY"].sort(),
    );
  });

  it("skips comments, blank lines, and `export` prefix", () => {
    const out = parseEnvFile(`
# OPENAI_API_KEY=commented
export OPENAI_API_KEY=via-export

   GROQ_API_KEY=trimmed
`);
    expect(out.map((e) => e.name)).toEqual(["OPENAI_API_KEY", "GROQ_API_KEY"]);
    expect(out[0]?.value).toBe("via-export");
  });

  it("skips placeholder values", () => {
    const out = parseEnvFile(`
OPENAI_API_KEY=changeme
ANTHROPIC_API_KEY=your_api_key_here
GROQ_API_KEY=
FOO_API_KEY=<replace-me>
BAR_API_KEY=xxxxxxx
REAL_API_KEY=actually-here
`);
    expect(out.map((e) => e.name)).toEqual(["REAL_API_KEY"]);
  });

  it("strips inline comments preceded by ` #`", () => {
    const out = parseEnvFile("OPENAI_API_KEY=sk-real # production");
    expect(out[0]?.value).toBe("sk-real");
  });

  it("returns correct line numbers", () => {
    const out = parseEnvFile(`# header

OPENAI_API_KEY=a
# comment
ANTHROPIC_API_KEY=b
`);
    expect(out[0]).toMatchObject({ name: "OPENAI_API_KEY", lineNumber: 3 });
    expect(out[1]).toMatchObject({ name: "ANTHROPIC_API_KEY", lineNumber: 5 });
  });

  it("ignores lowercase names", () => {
    const out = parseEnvFile("openai_api_key=lowercase");
    expect(out).toEqual([]);
  });
});
