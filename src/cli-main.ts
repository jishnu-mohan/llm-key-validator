#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { type CliIO, runCli } from "./cli.js";

function readStdinAll(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const io: CliIO = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
  stdinIsTTY: Boolean(process.stdin.isTTY),
  stdoutIsTTY: Boolean(process.stdout.isTTY),
  readStdin: readStdinAll,
  readFile: readFileOrNull,
};

runCli(process.argv.slice(2), io)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(3);
  });
