import { describe, it, expect, vi, beforeEach } from "vitest";
import { GriffinClient, GriffinApiError } from "./client";

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ "Content-Type": "application/json", ...headers }),
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchReject(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.griffin.xyz";

let client: GriffinClient;

beforeEach(() => {
  client = new GriffinClient({ baseUrl: BASE_URL });
  vi.stubGlobal("fetch", mockFetch(200, { intentId: "abc", status: "pending", createdAt: "now" }));
});

// ---------------------------------------------------------------------------
// GriffinApiError
// ---------------------------------------------------------------------------

describe("GriffinApiError", () => {
  it("is an instance of Error", () => {
    const err = new GriffinApiError(404, {
      code: "NOT_FOUND",
      message: "not found",
      timestamp: "now",
    });
    expect(err).toBeInstanceOf(Error);
  });

  it("exposes code, status, and message", () => {
    const err = new GriffinApiError(400, {
      code: "INVALID_AMOUNT",
      message: "Amount must be positive",
      timestamp: "now",
    });
    expect(err.code).toBe("INVALID_AMOUNT");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Amount must be positive");
  });

  it("exposes optional details", () => {
    const err = new GriffinApiError(400, {
      code: "ERR",
      message: "bad",
      timestamp: "now",
      details: { field: "amount" },
    });
    expect(err.details).toEqual({ field: "amount" });
  });

  it("has name GriffinApiError", () => {
    const err = new GriffinApiError(500, { code: "ERR", message: "x", timestamp: "now" });
    expect(err.name).toBe("GriffinApiError");
  });
});

// ---------------------------------------------------------------------------
// GriffinClient — constructor
// ---------------------------------------------------------------------------

describe("GriffinClient constructor", () => {
  it("strips trailing slash from baseUrl", async () => {
    const c = new GriffinClient({ baseUrl: "https://api.griffin.xyz/" });
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await c.getHealth();
    expect(spy.mock.calls[0][0]).toBe("https://api.griffin.xyz/api/v1/health");
  });

  it("sends Authorization header when apiKey is provided", async () => {
    const c = new GriffinClient({ baseUrl: BASE_URL, apiKey: "my-key" });
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await c.getHealth();
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-key");
  });

  it("does not send Authorization header when apiKey is absent", async () => {
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await client.getHealth();
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GriffinClient — request mechanics
// ---------------------------------------------------------------------------

describe("GriffinClient request mechanics", () => {
  it("sends Content-Type: application/json on POST", async () => {
    const spy = mockFetch(200, { intentId: "x", status: "pending", createdAt: "now" });
    vi.stubGlobal("fetch", spy);
    await client.createIntent({
      fromChain: "eip155:133",
      toChain: "eip155:133",
      fromToken: "0xA",
      toToken: "0xB",
      amount: "10",
      recipient: "0xR",
      userAddress: "0xU",
      requestMessage: "msg",
    });
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends method GET for getHealth", async () => {
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await client.getHealth();
    expect(spy.mock.calls[0][1]?.method).toBe("GET");
  });

  it("sends method POST for createIntent", async () => {
    const spy = mockFetch(200, { intentId: "x", status: "pending", createdAt: "now" });
    vi.stubGlobal("fetch", spy);
    await client.createIntent({
      fromChain: "eip155:133",
      toChain: "eip155:133",
      fromToken: "0xA",
      toToken: "0xB",
      amount: "10",
      recipient: "0xR",
      userAddress: "0xU",
      requestMessage: "msg",
    });
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
  });

  it("sends method DELETE for cancelIntent", async () => {
    const spy = mockFetch(204, null);
    vi.stubGlobal("fetch", spy);
    await client.cancelIntent("intent-1");
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("does not send a body on GET requests", async () => {
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await client.getHealth();
    expect(spy.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("serialises body as JSON on POST", async () => {
    const spy = mockFetch(200, { intentId: "x", status: "pending", createdAt: "now" });
    vi.stubGlobal("fetch", spy);
    const payload = {
      fromChain: "eip155:133",
      toChain: "eip155:133",
      fromToken: "0xA",
      toToken: "0xB",
      amount: "10",
      recipient: "0xR",
      userAddress: "0xU",
      requestMessage: "msg",
    };
    await client.createIntent(payload);
    expect(spy.mock.calls[0][1]?.body).toBe(JSON.stringify(payload));
  });

  it("returns undefined for 204 No Content without parsing", async () => {
    vi.stubGlobal("fetch", mockFetch(204, null));
    const result = await client.cancelIntent("intent-1");
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GriffinClient — error handling
// ---------------------------------------------------------------------------

describe("GriffinClient error handling", () => {
  it("throws GriffinApiError on 404 with correct code and status", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(404, { error: { code: "INTENT_NOT_FOUND", message: "not found", timestamp: "now" } }),
    );
    await expect(client.getIntent("bad-id")).rejects.toMatchObject({
      code: "INTENT_NOT_FOUND",
      status: 404,
    });
  });

  it("throws GriffinApiError on 400", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(400, { error: { code: "INVALID_AMOUNT", message: "bad amount", timestamp: "now" } }),
    );
    await expect(
      client.createIntent({
        fromChain: "eip155:133",
        toChain: "eip155:133",
        fromToken: "0xA",
        toToken: "0xB",
        amount: "-1",
        recipient: "0xR",
        userAddress: "0xU",
        requestMessage: "msg",
      }),
    ).rejects.toBeInstanceOf(GriffinApiError);
  });

  it("throws GriffinApiError on 500", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(500, { error: { code: "INTERNAL_SERVER_ERROR", message: "boom", timestamp: "now" } }),
    );
    await expect(client.getHealth()).rejects.toMatchObject({ status: 500 });
  });

  it("throws a plain Error when fetch rejects (network failure)", async () => {
    vi.stubGlobal("fetch", mockFetchReject(new Error("network error")));
    await expect(client.getHealth()).rejects.toThrow("network error");
    await expect(client.getHealth()).rejects.not.toBeInstanceOf(GriffinApiError);
  });
});

// ---------------------------------------------------------------------------
// GriffinClient — URL routing
// ---------------------------------------------------------------------------

describe("GriffinClient URL routing", () => {
  it("calls correct URL for getIntent", async () => {
    const spy = mockFetch(200, { intentId: "abc", status: "pending", createdAt: "now" });
    vi.stubGlobal("fetch", spy);
    await client.getIntent("abc");
    expect(spy.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/intents/abc`);
  });

  it("calls correct URL for getSupportedChains", async () => {
    const spy = mockFetch(200, []);
    vi.stubGlobal("fetch", spy);
    await client.getSupportedChains();
    expect(spy.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/chains`);
  });

  it("calls correct URL for getHealth", async () => {
    const spy = mockFetch(200, { status: "healthy", timestamp: "now", version: "1" });
    vi.stubGlobal("fetch", spy);
    await client.getHealth();
    expect(spy.mock.calls[0][0]).toBe(`${BASE_URL}/api/v1/health`);
  });
});
