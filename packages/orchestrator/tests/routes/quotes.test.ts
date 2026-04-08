import request from "supertest";
import express from "express";
import quoteRoutes from "../../src/routes/quotes";
import { errorHandler } from "../../src/middleware/errorHandler";
import { RouteService } from "../../src/services/RouteService";

const mockGetQuotes = jest.fn();
const mockRouteService = { getQuotes: mockGetQuotes } as unknown as RouteService;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/quotes", quoteRoutes(mockRouteService));
  app.use(errorHandler);
  return app;
};

const validBody = {
  fromChain: "stellar:testnet",
  toChain: "eip155:1",
  fromToken: "GABCDE",
  toToken: "GXYZ12",
  amount: "100",
};

describe("POST /api/v1/quotes", () => {
  it("returns 200 with routes when quotes are found", async () => {
    const mockRoute = {
      id: "r1",
      serviceId: "svc1",
      steps: [],
      totalCost: "0.01",
      estimatedTime: 120,
      slippageTolerance: 0.01,
      gasEstimate: { gasPrice: "100", serviceCost: "0", totalCost: "0.01" },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
    mockGetQuotes.mockResolvedValue([mockRoute]);

    const res = await request(buildApp()).post("/api/v1/quotes").send(validBody);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.routes)).toBe(true);
    expect(res.body.routes).toHaveLength(1);
    expect(res.body.bestRoute).toBeDefined();
  });

  it("returns 404 when no routes found", async () => {
    mockGetQuotes.mockResolvedValue([]);

    const res = await request(buildApp()).post("/api/v1/quotes").send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_ROUTES_AVAILABLE");
  });

  it("returns 400 when amount is missing", async () => {
    const res = await request(buildApp())
      .post("/api/v1/quotes")
      .send({ ...validBody, amount: undefined });
    expect(res.status).toBe(400);
  });

  it("returns 400 when fromChain is missing", async () => {
    const { fromChain, ...body } = validBody;
    const res = await request(buildApp()).post("/api/v1/quotes").send(body);
    expect(res.status).toBe(400);
  });

  it("response includes timestamp and expiresAt", async () => {
    mockGetQuotes.mockResolvedValue([
      {
        id: "r1",
        serviceId: "s1",
        steps: [],
        totalCost: "0",
        estimatedTime: 1,
        slippageTolerance: 0.01,
        gasEstimate: { gasPrice: "0", serviceCost: "0", totalCost: "0" },
        createdAt: new Date(),
        expiresAt: new Date(),
      },
    ]);

    const res = await request(buildApp()).post("/api/v1/quotes").send(validBody);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });
});
