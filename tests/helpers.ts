import { vi } from "vitest";

export interface MockResponse {
  status?: number;
  ok?: boolean;
  body?: unknown;
  delay?: number;
  throw?: unknown;
}

/** Build a mock `fetch` that returns the configured response. */
export function mockFetch(
  responses: MockResponse | MockResponse[],
): typeof fetch & { calls: { url: string; init?: RequestInit }[] } {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: { url: string; init?: RequestInit }[] = [];

  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    const cfg = queue.length > 1 ? queue.shift() : queue[0];
    if (!cfg) throw new Error("No mock response configured");

    if (cfg.throw) throw cfg.throw;
    if (cfg.delay) {
      await new Promise((r, rej) => {
        const t = setTimeout(r, cfg.delay);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          rej(new DOMException("Aborted", "AbortError"));
        });
      });
    }

    const status = cfg.status ?? 200;
    return new Response(cfg.body !== undefined ? JSON.stringify(cfg.body) : null, {
      status,
      headers: { "content-type": "application/json" },
    }) as Response & { ok: boolean };
  }) as unknown as typeof fetch & { calls: typeof calls };

  (fn as unknown as { calls: typeof calls }).calls = calls;
  return fn;
}
