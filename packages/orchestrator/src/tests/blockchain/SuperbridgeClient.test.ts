import { SuperbridgeClient } from "../../blockchain/superbridge/SuperbridgeClient";

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(status)),
  } as unknown as Response);
}

function stubFetch(mock: jest.Mock) {
  (global as any).fetch = mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FROM_CHAIN = "eip155:1";
const TO_CHAIN   = "eip155:133";
const FROM_TOKEN = "0xFromToken";
const TO_TOKEN   = "0xToToken";
const AMOUNT     = "1000000000000000000";
const SENDER     = "0xSenderAddress";
const RECIPIENT  = "0xRecipientAddress";

const makeSbQuote = (overrides: Record<string, unknown> = {}) => ({
  id: "route-123",
  provider: { name: "superbridge" },
  fromChainId: 1,
  toChainId: 133,
  fromTokenAddress: FROM_TOKEN,
  toTokenAddress: TO_TOKEN,
  amount: AMOUNT,
  estimatedReceived: "990000000000000000",
  estimatedTimeSeconds: 300,
  fees: { totalUsd: "1.50" },
  initiatingTransaction: { to: "0xBridge", data: "0xcalldata", value: "0" },
  ...overrides,
});

const makeRoutesResponse = (quotes: unknown[]) => ({
  results: quotes.map((q) => ({ result: q })),
});

let client: SuperbridgeClient;

beforeEach(() => {
  client = new SuperbridgeClient({ apiKey: "test-key", senderAddress: SENDER });
});

// ---------------------------------------------------------------------------
// getRoutes
// ---------------------------------------------------------------------------

describe("SuperbridgeClient.getRoutes", () => {
  it("returns mapped BridgeRoute for a valid quote", async () => {
    const spy = mockFetch(200, makeRoutesResponse([makeSbQuote()]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    expect(routes).toHaveLength(1);
    expect(routes[0].routeId).toBe("route-123");
    expect(routes[0].provider).toBe("superbridge");
    expect(routes[0].amountOut).toBe("990000000000000000");
    expect(routes[0].estimatedTimeSeconds).toBe(300);
    expect(routes[0].feesUsd).toBe("1.50");
  });

  it("returns empty array when all results have errors", async () => {
    const spy = mockFetch(200, makeRoutesResponse([{ error: "no route" }]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);
    expect(routes).toHaveLength(0);
  });

  it("returns empty array when results array is empty", async () => {
    const spy = mockFetch(200, makeRoutesResponse([]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);
    expect(routes).toHaveLength(0);
  });

  it("includes a bridge step in every route", async () => {
    const spy = mockFetch(200, makeRoutesResponse([makeSbQuote()]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);
    const bridgeStep = routes[0].steps.find((s) => !s.requiresApproval);
    expect(bridgeStep).toBeDefined();
    expect(bridgeStep!.description).toMatch(/Bridge via/);
  });

  it("includes approval step when tokenApproval is present", async () => {
    const quote = makeSbQuote({
      tokenApproval: { tx: { to: "0xToken", data: "0xapprove", value: "0" } },
    });
    const spy = mockFetch(200, makeRoutesResponse([quote]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);
    const approvalStep = routes[0].steps.find((s) => s.requiresApproval);
    expect(approvalStep).toBeDefined();
    expect(routes[0].steps).toHaveLength(2); // approval + bridge
  });

  it("includes revoke + approval + bridge steps when revokeTokenApproval is present", async () => {
    const quote = makeSbQuote({
      revokeTokenApproval: { tx: { to: "0xToken", data: "0xrevoke", value: "0" } },
      tokenApproval: { tx: { to: "0xToken", data: "0xapprove", value: "0" } },
    });
    const spy = mockFetch(200, makeRoutesResponse([quote]));
    stubFetch(spy);

    const routes = await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);
    expect(routes[0].steps).toHaveLength(3);
  });

  it("sends correct chain IDs to the API", async () => {
    const spy = mockFetch(200, makeRoutesResponse([makeSbQuote()]));
    stubFetch(spy);

    await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.fromChainId).toBe(1);   // eip155:1 → 1
    expect(body.toChainId).toBe(133);   // eip155:133 → 133
  });

  it("throws on API error response", async () => {
    stubFetch(mockFetch(500, {}));
    await expect(
      client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT),
    ).rejects.toThrow("Superbridge API error 500");
  });
});

// ---------------------------------------------------------------------------
// getStepTransaction
// ---------------------------------------------------------------------------

describe("SuperbridgeClient.getStepTransaction", () => {
  it("throws when route is not in cache", async () => {
    await expect(
      client.getStepTransaction("unknown-route", 0, SENDER, RECIPIENT),
    ).rejects.toThrow("not found in cache");
  });

  it("returns approval tx calldata for approval step without API call", async () => {
    const quote = makeSbQuote({
      tokenApproval: { tx: { to: "0xToken", data: "0xapprove", value: "0" } },
    });
    stubFetch(mockFetch(200, makeRoutesResponse([quote])));
    await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    // Reset fetch mock — approval step should NOT call the API
    const spy = jest.fn();
    stubFetch(spy);

    const stepTx = await client.getStepTransaction("route-123", 0, SENDER, RECIPIENT);
    expect(stepTx.to).toBe("0xToken");
    expect(stepTx.data).toBe("0xapprove");
    expect(spy).not.toHaveBeenCalled(); // no API call for approval
  });

  it("calls /v1/get_step_transaction for bridge step", async () => {
    stubFetch(mockFetch(200, makeRoutesResponse([makeSbQuote()])));
    await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    const stepTxResponse = { to: "0xBridge", data: "0xcalldata", value: "100" };
    const spy = mockFetch(200, stepTxResponse);
    stubFetch(spy);

    const stepTx = await client.getStepTransaction("route-123", 0, SENDER, RECIPIENT);
    expect(stepTx.to).toBe("0xBridge");
    expect(stepTx.value).toBe("100");

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.recipient).toBe(RECIPIENT);
    expect(body.submitter).toBe(SENDER);
  });

  it("returns correct chainId in step transaction", async () => {
    stubFetch(mockFetch(200, makeRoutesResponse([makeSbQuote()])));
    await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    stubFetch(mockFetch(200, { to: "0xB", data: "0x", value: "0" }));
    const stepTx = await client.getStepTransaction("route-123", 0, SENDER, RECIPIENT);

    expect(stepTx.chainId).toBe("eip155:1"); // fromChainId=1 → eip155:1
  });

  it("throws when step index is out of range", async () => {
    stubFetch(mockFetch(200, makeRoutesResponse([makeSbQuote()])));
    await client.getRoutes(FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT);

    await expect(
      client.getStepTransaction("route-123", 99, SENDER, RECIPIENT),
    ).rejects.toThrow("does not exist");
  });
});

// ---------------------------------------------------------------------------
// chainId conversion
// ---------------------------------------------------------------------------

describe("SuperbridgeClient chain ID conversion", () => {
  it("correctly parses eip155:1 → 1 in API request", async () => {
    const spy = mockFetch(200, makeRoutesResponse([]));
    stubFetch(spy);
    await client.getRoutes("eip155:1", "eip155:10", FROM_TOKEN, TO_TOKEN, AMOUNT);
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.fromChainId).toBe(1);
    expect(body.toChainId).toBe(10);
  });

  it("throws for unparseable chain ID", async () => {
    stubFetch(mockFetch(200, makeRoutesResponse([])));
    await expect(
      client.getRoutes("invalid", TO_CHAIN, FROM_TOKEN, TO_TOKEN, AMOUNT),
    ).rejects.toThrow("Cannot parse numeric chain ID");
  });
});

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

describe("SuperbridgeClient identity", () => {
  it("has name superbridge", () => {
    expect(client.name).toBe("superbridge");
  });
});
