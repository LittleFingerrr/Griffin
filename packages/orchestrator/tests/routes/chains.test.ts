import request from "supertest";
import express from "express";
import chainRoutes from "../../src/routes/chains";
import { errorHandler } from "../../src/middleware/errorHandler";
import { ChainService } from "../../src/services/ChainService";

jest.mock("../../src/utils/utils", () => ({
  getStellarTokens: jest.fn().mockResolvedValue([]),
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/chains", chainRoutes);
  app.use(errorHandler);
  return app;
};

describe("GET /api/v1/chains", () => {
  it("returns 200 with chains array", async () => {
    const res = await request(buildApp()).get("/api/v1/chains");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.chains)).toBe(true);
  });

  it("includes stellar:testnet in chains", async () => {
    const res = await request(buildApp()).get("/api/v1/chains");
    const ids = res.body.chains.map((c: any) => c.chainId);
    expect(ids).toContain("stellar:testnet");
  });
});

describe("GET /api/v1/chains/:chainId/tokens", () => {
  it("returns 404 when chain has no tokens", async () => {
    const res = await request(buildApp()).get(
      "/api/v1/chains/stellar:testnet/tokens",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_TOKENS_FOUND");
  });
});
