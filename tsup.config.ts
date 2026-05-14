import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli-main.ts",
    "core/index": "src/core/index.ts",
    "providers/index": "src/providers/index.ts",
    "providers/standalone": "src/providers/standalone.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
  minify: false,
  treeshake: true,
  shims: false,
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
});
