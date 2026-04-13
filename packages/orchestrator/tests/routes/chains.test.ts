import request from "supertest";
import express from "express";
import chainRoutes from "../../src/routes/chains";
import { errorHandler } from "../../src/middleware/errorHandler";

jest.mock("../../src/utils/utils", () => ({
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

  it("includes eip155:133 in chains", async () => {
    const res = await request(buildApp()).get("/api/v1/chains");
    const ids = res.body.chains.map((c: any) => c.chainId);
    expect(ids).toContain("eip155:133");
  });
});

describe("GET /api/v1/chains/:chainId/tokens", () => {
  it("returns 404 when chain has no tokens", async () => {
    const res = await request(buildApp()).get("/api/v1/chains/eip155:1/tokens");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_TOKENS_FOUND");
  });
});
