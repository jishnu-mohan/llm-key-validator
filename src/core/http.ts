import type { ValidationFailureReason } from "./types.js";

export class HttpError extends Error {
  constructor(
    public readonly reason: Extract<
      ValidationFailureReason,
      "timeout" | "network_error" | "server_error"
    >,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpOptions {
  timeoutMs: number;
  retries: number;
  fetch: typeof fetch;
  userSignal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(signals);

  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function request(
  input: string,
  init: RequestInit,
  opts: HttpOptions,
): Promise<Response> {
  const { timeoutMs, retries, fetch: fetchImpl, userSignal } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signals: AbortSignal[] = [timeoutSignal];
    if (userSignal) signals.push(userSignal);
    const signal = combineSignals(signals);

    try {
      const res = await fetchImpl(input, { ...init, signal });
      if (res.status >= 500 && attempt < retries) {
        lastError = new HttpError("server_error", `Server error ${res.status}`, res.status);
        await sleep(250 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (timeoutSignal.aborted) {
          throw new HttpError("timeout", `Request timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new HttpError("timeout", `Request timed out after ${timeoutMs}ms`);
      }
      if (err instanceof TypeError) {
        if (attempt < retries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        throw new HttpError("network_error", err.message);
      }
      throw err;
    }
  }

  if (lastError instanceof HttpError) throw lastError;
  throw new HttpError("server_error", "Exhausted retries");
}
