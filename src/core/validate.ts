import { HttpError, request } from "./http.js";
import { detectProvider, getProvider } from "./registry.js";
import type {
  Provider,
  ProviderRawResult,
  ValidationFailureReason,
  ValidationOptions,
  ValidationResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 1;

export function normalizeKey(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/^["'](.*)["']$/, "$1");
}

function failure(
  provider: string,
  reason: ValidationFailureReason,
  message: string,
  latencyMs: number,
  status?: number,
): ValidationResult {
  return { valid: false, provider, reason, message, latencyMs, status };
}

function mapStatusToReason(status: number): ValidationFailureReason | null {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return null;
}

export async function validateKey(
  rawKey: unknown,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const start = Date.now();
  const key = normalizeKey(rawKey);

  if (!key) {
    return failure(
      options.provider ?? "unknown",
      "malformed_key",
      "API key must be a non-empty string",
      Date.now() - start,
    );
  }

  const scoped = options.providers;
  let provider: Provider | undefined;
  if (options.provider) {
    provider = scoped
      ? scoped.find((p) => p.name === options.provider)
      : getProvider(options.provider);
    if (!provider) {
      return failure(
        options.provider,
        "unknown_provider",
        `Unknown provider: ${options.provider}`,
        Date.now() - start,
      );
    }
  } else {
    provider = scoped ? scoped.find((p) => p.detect(key)) : detectProvider(key);
    if (!provider) {
      return failure(
        "unknown",
        "unknown_provider",
        "Could not detect provider from key. Specify `provider` explicitly.",
        Date.now() - start,
      );
    }
  }

  if (options.offline) {
    if (!provider.detect(key)) {
      return failure(
        provider.name,
        "invalid_key",
        `Key format does not match provider ${provider.name}`,
        Date.now() - start,
      );
    }
    return {
      valid: true,
      provider: provider.name,
      latencyMs: Date.now() - start,
      metadata: { offline: true },
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return failure(
      provider.name,
      "network_error",
      "No fetch implementation available. Use Node 20+ or pass `fetch` option.",
      Date.now() - start,
    );
  }

  const wrappedHttp: typeof fetch = (input, init) =>
    request(typeof input === "string" ? input : input.toString(), init ?? {}, {
      timeoutMs,
      retries,
      fetch: fetchImpl,
      userSignal: options.signal,
    });

  let raw: ProviderRawResult;
  try {
    raw = await provider.validate(key, {
      http: wrappedHttp,
      signal: options.signal ?? new AbortController().signal,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof HttpError) {
      return failure(provider.name, err.reason, err.message, latencyMs, err.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(provider.name, "network_error", message, latencyMs);
  }

  const latencyMs = Date.now() - start;
  if (raw.ok) {
    return {
      valid: true,
      provider: provider.name,
      latencyMs,
      metadata: raw.metadata,
    };
  }

  const reason = mapStatusToReason(raw.status) ?? "invalid_key";
  return failure(provider.name, reason, `HTTP ${raw.status}`, latencyMs, raw.status);
}

export async function validateKeys(
  keys: unknown[],
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  return Promise.all(keys.map((k) => validateKey(k, options)));
}
