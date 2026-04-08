import { ChainService } from "../../src/services/ChainService";
import { AppError } from "../../src/middleware/errorHandler";
import * as utils from "../../src/utils/utils";

// ChainService constructor calls getStellarTokens — stub it out
jest.mock("../../src/utils/utils", () => ({
  ...jest.requireActual("../../src/utils/utils"),
  getStellarTokens: jest.fn().mockResolvedValue([]),
}));

const STELLAR_TESTNET = "stellar:testnet";

describe("ChainService — static methods", () => {
  it("getSupportedChains returns at least one chain", async () => {
    const chains = await ChainService.getSupportedChains();
    expect(chains.length).toBeGreaterThan(0);
  });

  it("getSupportedChains includes stellar:testnet", async () => {
    const chains = await ChainService.getSupportedChains();
    const ids = chains.map((c) => c.chainId);
    expect(ids).toContain(STELLAR_TESTNET);
  });

  it("getChainInfo returns chain for known chainId", async () => {
    const chain = await ChainService.getChainInfo(STELLAR_TESTNET);
    expect(chain).not.toBeNull();
    expect(chain!.chainId).toBe(STELLAR_TESTNET);
  });

  it("getChainInfo returns null for unknown chainId", async () => {
    const chain = await ChainService.getChainInfo("unknown:chain");
    expect(chain).toBeNull();
  });

  it("isChainSupported returns true for stellar:testnet", async () => {
    expect(await ChainService.isChainSupported(STELLAR_TESTNET)).toBe(true);
  });

  it("isChainSupported returns false for unknown chain", async () => {
    expect(await ChainService.isChainSupported("eip155:1")).toBe(false);
  });
});

describe("ChainService — instance methods", () => {
  let service: ChainService;

  beforeEach(() => {
    service = new ChainService();
  });

  it("getSupportedTokens returns empty array when no tokens loaded", async () => {
    const tokens = await service.getSupportedTokens();
    expect(tokens).toEqual([]);
  });

  it("getSupportedTokens throws 404 when chainId has no tokens", async () => {
    await expect(service.getSupportedTokens(STELLAR_TESTNET)).rejects.toMatchObject({
      statusCode: 404,
      code: "NO_TOKENS_FOUND",
    });
  });

  it("isTokenSupported returns false when no tokens loaded", async () => {
    const result = await service.isTokenSupported("GTOKEN", STELLAR_TESTNET);
    expect(result).toBe(false);
  });

  it("getTokenInfo returns null when no tokens loaded", async () => {
    const result = await service.getTokenInfo("GTOKEN", STELLAR_TESTNET);
    expect(result).toBeNull();
  });

  describe("with tokens loaded", () => {
    const TOKEN_ADDRESS = "GABCDE1234567890";
    const TOKEN_CHAIN = STELLAR_TESTNET;

    beforeEach(() => {
      // Inject tokens directly into the private field for testing
      (service as any).supportedTokens = [
        {
          address: TOKEN_ADDRESS,
          symbol: "XLM",
          name: "Stellar Lumens",
          decimals: 7,
          chainId: TOKEN_CHAIN,
        },
      ];
    });

    it("getSupportedTokens returns all tokens when no chainId filter", async () => {
      const tokens = await service.getSupportedTokens();
      expect(tokens).toHaveLength(1);
    });

    it("getSupportedTokens filters by chainId", async () => {
      const tokens = await service.getSupportedTokens(TOKEN_CHAIN);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].chainId).toBe(TOKEN_CHAIN);
    });

    it("isTokenSupported returns true for known token", async () => {
      expect(await service.isTokenSupported(TOKEN_ADDRESS, TOKEN_CHAIN)).toBe(true);
    });

    it("isTokenSupported is case-insensitive on address", async () => {
      expect(await service.isTokenSupported(TOKEN_ADDRESS.toLowerCase(), TOKEN_CHAIN)).toBe(true);
    });

    it("isTokenSupported returns false for wrong chain", async () => {
      expect(await service.isTokenSupported(TOKEN_ADDRESS, "other:chain")).toBe(false);
    });

    it("getTokenInfo returns token for known address+chain", async () => {
      const token = await service.getTokenInfo(TOKEN_ADDRESS, TOKEN_CHAIN);
      expect(token).not.toBeNull();
      expect(token!.symbol).toBe("XLM");
    });

    it("getTokenInfo returns null for unknown address", async () => {
      const token = await service.getTokenInfo("GUNKNOWN", TOKEN_CHAIN);
      expect(token).toBeNull();
    });
  });
});
