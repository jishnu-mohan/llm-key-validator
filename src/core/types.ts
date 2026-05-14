export interface ValidationContext {
  http: typeof fetch;
  signal: AbortSignal;
}

export interface ProviderRawResult {
  status: number;
  ok: boolean;
  metadata?: Record<string, unknown>;
}

export interface Provider {
  name: string;
  displayName: string;
  /** Standard environment variable name the CLI falls back to (e.g. "OPENAI_API_KEY"). */
  keyEnvVar?: string;
  detect(key: string): boolean;
  validate(key: string, ctx: ValidationContext): Promise<ProviderRawResult>;
}

export interface ValidationOptions {
  provider?: string;
  /** When set, only these providers are considered for detection. Skips the global registry. */
  providers?: Provider[];
  /** Skip the network call; return `valid: true` if the key matches `detect()`, else `format_only`. */
  offline?: boolean;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export type ValidationFailureReason =
  | "invalid_key"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "timeout"
  | "unknown_provider"
  | "malformed_key";

export type ValidationResult =
  | {
      valid: true;
      provider: string;
      latencyMs: number;
      metadata?: Record<string, unknown>;
    }
  | {
      valid: false;
      provider: string;
      reason: ValidationFailureReason;
      status?: number;
      message: string;
      latencyMs: number;
    };
