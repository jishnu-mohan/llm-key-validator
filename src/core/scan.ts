// Parse .env-style content and extract entries that look like API keys.

export interface EnvEntry {
  name: string;
  value: string;
  lineNumber: number;
}

const PLACEHOLDER_PATTERNS = [
  /^changeme$/i,
  /^your[_-]?(api[_-]?)?key([_-]?here)?$/i,
  /^xxx+$/i,
  /^\.\.\.$/,
  /^todo$/i,
  /^placeholder$/i,
  /^<[^>]+>$/,
];

function isPlaceholder(value: string): boolean {
  if (value.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

/**
 * Parse `.env`-style content. Returns entries whose name suggests an API key
 * (ends in `_API_KEY`, `_TOKEN`, `_SECRET`, or `_KEY`) and whose value is not a placeholder.
 */
export function parseEnvFile(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  const lines = content.split(/\r?\n/);
  const keyPattern = /^[A-Z][A-Z0-9_]*$/;
  const apiKeyHint = /(_API_KEY|_KEY|_TOKEN|_SECRET)$/;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const line = raw.replace(/^\s*export\s+/, "").trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (!keyPattern.test(name)) continue;
    if (!apiKeyHint.test(name)) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const hashIdx = value.indexOf(" #");
    if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();

    if (isPlaceholder(value)) continue;

    entries.push({ name, value, lineNumber: i + 1 });
  }

  return entries;
}
