import request from "supertest";
import express from "express";
import intentRoutes from "../../routes/intents";
import { errorHandler } from "../../middleware/errorHandler";
import { IntentService } from "../../services/IntentService";
import { SettlementEngine } from "../../settlement/SettlementEngine";
import { IntentStatus } from "../../types";

jest.mock("../../utils/utils", () => ({
  GriffinSupportedChains: [
    {
      chainId: "eip155:133",
      name: "Hashkey Testnet",
      symbol: "HSK",
      rpcUrl: "https://testnet.hsk.xyz",
      blockExplorer: "https://testnet-explorer.hsk.xyz",
      isTestnet: true,
    },
  ],
  GriffinSupportedTokens: [],
  validateAddress: jest.fn().mockReturnValue(true),
  validateSignature: jest.fn().mockResolvedValue(true),
}));

const mockIntent = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  status: IntentStatus.PENDING,
  fromChain: "stellar:testnet",
  toChain: "stellar:testnet",
  fromToken: "GABCDE",
  toToken: "GXYZ12",
  amount: "100",
  recipient: "GRECIPIENT",
  userAddress: "GSENDER",
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
};

const makeService = () => {
  const engine = {
    settle: jest.fn().mockResolvedValue({
      transactionHash: "0xabc",
      actualInputAmount: "100",
      actualOutputAmount: "99",
      settlerUsed: "swap",
      executedRoute: {},
      durationMs: 100,
    }),
    getRegisteredSettlers: jest.fn().mockReturnValue([]),
  } as unknown as SettlementEngine;

  return new IntentService(engine);
};

const buildApp = (service?: IntentService) => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/intents", intentRoutes(service ?? makeService()));
  app.use(errorHandler);
  return app;
};

const validBody = {
  fromChain: "eip155:133",
  toChain: "eip155:133",
  fromToken: "0xb8F355f10569FD2A765296161d082Cc37c5843c2",
  toToken: "0xc4C2841367016C9e2652Fecc49bBA9229787bA82",
  amount: "100",
  recipient: "0xB1655beD2370B9Ad33Dd4ab905a7923D29Ab6778",
  userAddress: "0xB1655beD2370B9Ad33Dd4ab905a7923D29Ab6778",
  requestSignature: "sig",
  requestMessage: "msg",
};

describe("POST /api/v1/intents", () => {
  it("returns 201 with intentId on valid request", async () => {
    const res = await request(buildApp()).post("/api/v1/intents").send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.intentId).toBeDefined();
    expect(res.body.status).toBe(IntentStatus.PENDING);
  });

  it("returns 400 when amount is missing", async () => {
    const { amount, ...body } = validBody;
    const res = await request(buildApp()).post("/api/v1/intents").send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when fromChain is missing", async () => {
    const { fromChain, ...body } = validBody;
    const res = await request(buildApp()).post("/api/v1/intents").send(body);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/intents/:id", () => {
  it("returns 400 for non-UUID id", async () => {
    const res = await request(buildApp()).get("/api/v1/intents/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown UUID", async () => {
    const res = await request(buildApp()).get(
      "/api/v1/intents/550e8400-e29b-41d4-a716-446655440000",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INTENT_NOT_FOUND");
  });

  it("returns 200 with intent after creation", async () => {
    const app = buildApp();
    const createRes = await request(app).post("/api/v1/intents").send(validBody);
    const { intentId } = createRes.body;

    const getRes = await request(app).get(`/api/v1/intents/${intentId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.intentId).toBe(intentId);
  });
});

describe("PUT /api/v1/intents/:id/execute", () => {
  it("returns 400 for non-UUID id", async () => {
    const res = await request(buildApp()).put("/api/v1/intents/bad-id/execute");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown UUID", async () => {
    const res = await request(buildApp()).put(
      "/api/v1/intents/550e8400-e29b-41d4-a716-446655440000/execute",
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with COMPLETED status after execution", async () => {
    const app = buildApp();
    const createRes = await request(app).post("/api/v1/intents").send(validBody);
    const { intentId } = createRes.body;

    const execRes = await request(app).put(`/api/v1/intents/${intentId}/execute`);
    expect(execRes.status).toBe(200);
    expect(execRes.body.status).toBe(IntentStatus.COMPLETED);
  });
});

describe("DELETE /api/v1/intents/:id", () => {
  it("returns 400 for non-UUID id", async () => {
    const res = await request(buildApp()).delete("/api/v1/intents/bad-id");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown UUID", async () => {
    const res = await request(buildApp()).delete(
      "/api/v1/intents/550e8400-e29b-41d4-a716-446655440000",
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 after cancelling a pending intent", async () => {
    const app = buildApp();
    const createRes = await request(app).post("/api/v1/intents").send(validBody);
    const { intentId } = createRes.body;

    const delRes = await request(app).delete(`/api/v1/intents/${intentId}`);
    expect(delRes.status).toBe(204);
  });
});
