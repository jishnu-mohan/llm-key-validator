import { describe, expect, it } from "vitest";
import { HttpError, request } from "../src/core/http.js";
import { mockFetch } from "./helpers.js";

describe("request", () => {
  it("returns response on 200", async () => {
    const fetchImpl = mockFetch({ status: 200, body: { ok: true } });
    const res = await request(
      "https://example.com",
      {},
      { timeoutMs: 1000, retries: 0, fetch: fetchImpl },
    );
    expect(res.status).toBe(200);
  });

  it("returns response on 401 without retry", async () => {
    const fetchImpl = mockFetch({ status: 401 });
    const res = await request(
      "https://example.com",
      {},
      { timeoutMs: 1000, retries: 1, fetch: fetchImpl },
    );
    expect(res.status).toBe(401);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("retries on 5xx then returns last response when retries exhausted", async () => {
    const fetchImpl = mockFetch([{ status: 500 }, { status: 500 }]);
    const res = await request(
      "https://example.com",
      {},
      { timeoutMs: 1000, retries: 1, fetch: fetchImpl },
    );
    expect(res.status).toBe(500);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("retries on 5xx and returns 200 if second succeeds", async () => {
    const fetchImpl = mockFetch([{ status: 503 }, { status: 200, body: { ok: true } }]);
    const res = await request(
      "https://example.com",
      {},
      { timeoutMs: 1000, retries: 1, fetch: fetchImpl },
    );
    expect(res.status).toBe(200);
  });

  it("maps TypeError to network_error after retries exhausted", async () => {
    const fetchImpl = mockFetch([
      { throw: new TypeError("fetch failed") },
      { throw: new TypeError("fetch failed") },
    ]);
    await expect(
      request("https://example.com", {}, { timeoutMs: 1000, retries: 1, fetch: fetchImpl }),
    ).rejects.toMatchObject({ reason: "network_error" });
  });

  it("recovers from a network error if retry succeeds", async () => {
    const fetchImpl = mockFetch([{ throw: new TypeError("fetch failed") }, { status: 200 }]);
    const res = await request(
      "https://example.com",
      {},
      { timeoutMs: 1000, retries: 1, fetch: fetchImpl },
    );
    expect(res.status).toBe(200);
  });

  it("maps abort to timeout when our timeout fired", async () => {
    const fetchImpl = mockFetch({ delay: 200 });
    await expect(
      request("https://example.com", {}, { timeoutMs: 20, retries: 0, fetch: fetchImpl }),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
