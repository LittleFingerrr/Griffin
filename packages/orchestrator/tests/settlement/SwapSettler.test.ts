import { SwapSettler } from "../../src/settlement/SwapSettler";
import { SettlerType } from "../../src/settlement/ISettler";
import { type IDexClient, type DexQuote } from "../../src/blockchain/IDexClient";
import { type IChainClient } from "../../src/blockchain/IChainClient";
import { type Intent, IntentStatus } from "../../src/types";
import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../../src/utils/utils", () => ({
  getStellarTokens: jest.fn().mockResolvedValue([]),
  validateAddress: jest.fn().mockReturnValue(true),
}));

jest.mock("../../src/services/ChainService", () => ({
  ChainService: jest.fn().mockImplementation(() => ({
    getTokenInfo: jest.fn().mockResolvedValue({ decimals: 18 }),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_ID = "eip155:133";
const TOKEN_IN = "0xTokenIn";
const TOKEN_OUT = "0xTokenOut";
const RECIPIENT = "0xRecipient";
const TX_HASH = "0xdeadbeef";

const AMOUNT_IN = ethers.parseUnits("10", 18);
const AMOUNT_OUT = ethers.parseUnits("9.7", 18); // ~0.3% fee

const makeIntent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  userAddress: "0xUser",
  fromChain: CHAIN_ID,
  toChain: CHAIN_ID,
  fromToken: TOKEN_IN,
  toToken: TOKEN_OUT,
  amount: "10",
  recipient: RECIPIENT,
  status: IntentStatus.PENDING,
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
  ...overrides,
});

const makeQuote = (overrides: Partial<DexQuote> = {}): DexQuote => ({
  amountOut: AMOUNT_OUT,
  priceImpact: 0.003,
  ...overrides,
});

const makeDexClient = (quoteOverride?: DexQuote | null): jest.Mocked<IDexClient> => ({
  name: "griffin-dex",
  getQuote: jest.fn().mockResolvedValue(quoteOverride === undefined ? makeQuote() : quoteOverride),
  swap: jest.fn().mockResolvedValue(TX_HASH),
  waitForConfirmation: jest.fn().mockResolvedValue(undefined),
});

const makeChainClient = (): jest.Mocked<IChainClient> => ({
  chainId: CHAIN_ID,
  getTokenBalance: jest.fn().mockResolvedValue(ethers.parseUnits("100", 18)),
  transferToken: jest.fn().mockResolvedValue(TX_HASH),
  waitForConfirmation: jest.fn().mockResolvedValue(undefined),
});

const makeSettler = (dex?: jest.Mocked<IDexClient>, chain?: jest.Mocked<IChainClient>) => {
  const dexMap = new Map<string, IDexClient>();
  const chainMap = new Map<string, IChainClient>();
  if (dex) dexMap.set(CHAIN_ID, dex);
  if (chain) chainMap.set(CHAIN_ID, chain);
  return {
    settler: new SwapSettler(dexMap, chainMap),
    dex,
    chain,
  };
};

// ---------------------------------------------------------------------------
// canSettle
// ---------------------------------------------------------------------------

describe("SwapSettler.canSettle", () => {
  it("declines when no DEX client is registered for the destination chain", async () => {
    const { settler } = makeSettler(); // empty maps
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No DEX client/);
  });

  it("declines when getQuote returns null (no pool / no liquidity)", async () => {
    const dex = makeDexClient(null);
    const { settler } = makeSettler(dex);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No liquidity/);
  });

  it("declines when getQuote returns zero amountOut", async () => {
    const dex = makeDexClient({ amountOut: 0n });
    const { settler } = makeSettler(dex);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No liquidity/);
  });

  it("declines when getQuote throws", async () => {
    const dex = makeDexClient();
    dex.getQuote.mockRejectedValueOnce(new Error("RPC timeout"));
    const { settler } = makeSettler(dex);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/DEX quote failed/);
  });

  it("returns capable=true when a valid quote exists", async () => {
    const dex = makeDexClient();
    const { settler } = makeSettler(dex);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(true);
  });

  it("calls getQuote with correct args", async () => {
    const dex = makeDexClient();
    const { settler } = makeSettler(dex);
    await settler.canSettle(makeIntent());
    expect(dex.getQuote).toHaveBeenCalledWith(TOKEN_IN, TOKEN_OUT, AMOUNT_IN, CHAIN_ID);
  });
});

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

describe("SwapSettler.settle", () => {
  it("throws NO_DEX_CLIENT when no DEX client is registered", async () => {
    const { settler } = makeSettler();
    await expect(settler.settle(makeIntent())).rejects.toMatchObject({
      code: "NO_DEX_CLIENT",
    });
  });

  it("throws NO_CHAIN_CLIENT when no chain client is registered", async () => {
    const dex = makeDexClient();
    const { settler } = makeSettler(dex); // no chain client
    await expect(settler.settle(makeIntent())).rejects.toMatchObject({
      code: "NO_CHAIN_CLIENT",
    });
  });

  it("throws NO_LIQUIDITY when live quote returns null", async () => {
    const dex = makeDexClient(null);
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);
    await expect(settler.settle(makeIntent())).rejects.toMatchObject({
      code: "NO_LIQUIDITY",
    });
  });

  it("calls swap with correct args including slippage-adjusted minAmountOut", async () => {
    const dex = makeDexClient();
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);

    await settler.settle(makeIntent());

    // minAmountOut = amountOut * (10000 - 50) / 10000 = 99.5% of amountOut
    const expectedMin = (AMOUNT_OUT * 9950n) / 10000n;
    expect(dex.swap).toHaveBeenCalledWith(
      TOKEN_IN,
      TOKEN_OUT,
      AMOUNT_IN,
      expectedMin,
      RECIPIENT,
      CHAIN_ID,
    );
  });

  it("calls waitForConfirmation with the tx hash", async () => {
    const dex = makeDexClient();
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);

    await settler.settle(makeIntent());

    expect(dex.waitForConfirmation).toHaveBeenCalledWith(TX_HASH, CHAIN_ID);
  });

  it("returns a SettlementResult with correct shape", async () => {
    const dex = makeDexClient();
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);

    const result = await settler.settle(makeIntent());

    expect(result.transactionHash).toBe(TX_HASH);
    expect(result.actualInputAmount).toBe("10");
    expect(result.settlerUsed).toBe(SettlerType.SWAP);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an executedRoute with correct step info", async () => {
    const dex = makeDexClient();
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);
    const intent = makeIntent();

    const result = await settler.settle(intent);
    const step = result.executedRoute.steps[0];

    expect(step.type).toBe("swap");
    expect(step.fromToken).toBe(TOKEN_IN);
    expect(step.toToken).toBe(TOKEN_OUT);
    expect(step.fromChain).toBe(CHAIN_ID);
    expect(step.toChain).toBe(CHAIN_ID);
  });

  it("propagates error when swap rejects", async () => {
    const dex = makeDexClient();
    dex.swap.mockRejectedValueOnce(new Error("swap reverted"));
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);

    await expect(settler.settle(makeIntent())).rejects.toThrow("swap reverted");
  });

  it("propagates error when waitForConfirmation rejects", async () => {
    const dex = makeDexClient();
    dex.waitForConfirmation.mockRejectedValueOnce(new Error("confirmation timeout"));
    const chain = makeChainClient();
    const { settler } = makeSettler(dex, chain);

    await expect(settler.settle(makeIntent())).rejects.toThrow("confirmation timeout");
  });
});

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

describe("SwapSettler identity", () => {
  it("has type SWAP", () => {
    const { settler } = makeSettler();
    expect(settler.type).toBe(SettlerType.SWAP);
  });
});
