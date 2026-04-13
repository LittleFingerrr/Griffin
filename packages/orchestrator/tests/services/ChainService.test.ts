import { ChainService } from "../../src/services/ChainService";
import * as utils from "../../src/utils/utils";

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
  GriffinSupportedTokens: [
    {
      address: "0xb8F355f10569FD2A765296161d082Cc37c5843c2",
      symbol: "tHSK",
      name: "Test HSK",
      decimals: 18,
      chainId: "eip155:133",
    },
    {
      address: "0xc4C2841367016C9e2652Fecc49bBA9229787bA82",
      symbol: "tUSDC",
      name: "Test USDC",
      decimals: 6,
      chainId: "eip155:133",
    },
  ],
  validateAddress: jest.fn().mockReturnValue(true),
}));

const HASHKEY_TESTNET = "eip155:133";

describe("ChainService — static methods", () => {
  it("getSupportedChains returns at least one chain", async () => {
    const chains = await ChainService.getSupportedChains();
    expect(chains.length).toBeGreaterThan(0);
  });

  it("getSupportedChains includes stellar:testnet", async () => {
    const chains = await ChainService.getSupportedChains();
    const ids = chains.map((c) => c.chainId);
    expect(ids).toContain(HASHKEY_TESTNET);
  });

  it("getChainInfo returns chain for known chainId", async () => {
    const chain = await ChainService.getChainInfo(HASHKEY_TESTNET);
    expect(chain).not.toBeNull();
    expect(chain!.chainId).toBe(HASHKEY_TESTNET);
  });

  it("getChainInfo returns null for unknown chainId", async () => {
    const chain = await ChainService.getChainInfo("unknown:chain");
    expect(chain).toBeNull();
  });

  it("isChainSupported returns true for stellar:testnet", async () => {
    expect(await ChainService.isChainSupported(HASHKEY_TESTNET)).toBe(true);
  });

  it("isChainSupported returns false for unknown chain", async () => {
    expect(await ChainService.isChainSupported("eip155:1")).toBe(false);
  });
});

describe("ChainService — instance methods", () => {
  let service: ChainService;

  beforeEach(() => {
    service = new ChainService(utils.GriffinSupportedTokens);
  });

  it("getSupportedTokens returns empty array when no tokens loaded", async () => {
    service = new ChainService([]);
    const tokens = await service.getSupportedTokens();
    expect(tokens).toEqual([]);
  });

  it("getSupportedTokens throws 404 when chainId has no tokens", async () => {
    await expect(service.getSupportedTokens("eip155:1")).rejects.toMatchObject({
      statusCode: 404,
      code: "NO_TOKENS_FOUND",
    });
  });

  it("isTokenSupported returns false when no tokens loaded", async () => {
    const result = await service.isTokenSupported("GTOKEN", HASHKEY_TESTNET);
    expect(result).toBe(false);
  });

  it("getTokenInfo returns null when no tokens loaded", async () => {
    const result = await service.getTokenInfo("GTOKEN", HASHKEY_TESTNET);
    expect(result).toBeNull();
  });

  describe("with tokens loaded", () => {
    const TOKEN_ADDRESS = "0x1ba23455678ab";
    const TOKEN_CHAIN = HASHKEY_TESTNET;

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
