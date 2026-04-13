import { InventorySettler } from "../../settlement/InventorySettler";
import { SettlerType } from "../../settlement/ISettler";
import { type IChainClient } from "../../blockchain/IChainClient";
import { type Intent, IntentStatus } from "../../types";
import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../../utils/utils", () => ({
  getStellarTokens: jest.fn().mockResolvedValue([]),
  validateAddress: jest.fn().mockReturnValue(true),
}));

// Mock ChainService so getTokenInfo returns 18 decimals by default
jest.mock("../../services/ChainService", () => ({
  ChainService: jest.fn().mockImplementation(() => ({
    getTokenInfo: jest.fn().mockResolvedValue({ decimals: 18 }),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_ID = "eip155:133";
const VAULT_ADDRESS = "0xVault";
const TOKEN_ADDRESS = "0xToken";
const RECIPIENT = "0xRecipient";
const TX_HASH = "0xdeadbeef";

/** Build a minimal valid intent */
const makeIntent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  userAddress: "0xUser",
  fromChain: CHAIN_ID,
  toChain: CHAIN_ID,
  fromToken: TOKEN_ADDRESS,
  toToken: TOKEN_ADDRESS,
  amount: "10",
  recipient: RECIPIENT,
  status: IntentStatus.PENDING,
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
  ...overrides,
});

/** Build a mock IChainClient */
const makeClient = (balanceOverride?: bigint): jest.Mocked<IChainClient> => ({
  chainId: CHAIN_ID,
  getTokenBalance: jest.fn().mockResolvedValue(
    balanceOverride ?? ethers.parseUnits("100", 18), // 100 tokens — plenty
  ),
  transferToken: jest.fn().mockResolvedValue(TX_HASH),
  waitForConfirmation: jest.fn().mockResolvedValue(undefined),
});

/** Build an InventorySettler with one registered client */
const makeSettler = (client?: jest.Mocked<IChainClient>) => {
  const map = new Map<string, IChainClient>();
  if (client) map.set(CHAIN_ID, client);
  return { settler: new InventorySettler(map, VAULT_ADDRESS), client };
};

// ---------------------------------------------------------------------------
// canSettle
// ---------------------------------------------------------------------------

describe("InventorySettler.canSettle", () => {
  it("declines when no client is registered for the destination chain", async () => {
    const { settler } = makeSettler(); // empty map
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No chain client/);
  });

  it("declines when vault balance is insufficient", async () => {
    const tinyBalance = ethers.parseUnits("1", 18); // only 1 token
    const client = makeClient(tinyBalance);
    const { settler } = makeSettler(client);

    // Intent asks for 10 tokens — more than the 1 available
    const result = await settler.canSettle(makeIntent({ amount: "10" }));
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/Insufficient vault balance/);
  });

  it("declines when getTokenBalance throws", async () => {
    const client = makeClient();
    client.getTokenBalance.mockRejectedValueOnce(new Error("RPC timeout"));
    const { settler } = makeSettler(client);

    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/Failed to fetch vault balance/);
  });

  it("returns capable=true when vault has exactly enough balance", async () => {
    const exactBalance = ethers.parseUnits("10", 18); // exactly 10 tokens
    const client = makeClient(exactBalance);
    const { settler } = makeSettler(client);

    const result = await settler.canSettle(makeIntent({ amount: "10" }));
    expect(result.capable).toBe(true);
  });

  it("returns capable=true when vault has more than enough balance", async () => {
    const client = makeClient(); // 100 tokens
    const { settler } = makeSettler(client);

    const result = await settler.canSettle(makeIntent({ amount: "10" }));
    expect(result.capable).toBe(true);
  });

  it("calls getTokenBalance with the correct token and vault address", async () => {
    const client = makeClient();
    const { settler } = makeSettler(client);

    await settler.canSettle(makeIntent());

    expect(client.getTokenBalance).toHaveBeenCalledWith(TOKEN_ADDRESS, VAULT_ADDRESS);
  });
});

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

describe("InventorySettler.settle", () => {
  it("calls transferToken with correct token, recipient, and raw amount", async () => {
    const client = makeClient();
    const { settler } = makeSettler(client);

    await settler.settle(makeIntent({ amount: "10" }));

    expect(client.transferToken).toHaveBeenCalledWith(
      TOKEN_ADDRESS,
      RECIPIENT,
      ethers.parseUnits("10", 18),
    );
  });

  it("calls waitForConfirmation with the tx hash returned by transferToken", async () => {
    const client = makeClient();
    const { settler } = makeSettler(client);

    await settler.settle(makeIntent());

    expect(client.waitForConfirmation).toHaveBeenCalledWith(TX_HASH);
  });

  it("returns a SettlementResult with the correct shape", async () => {
    const client = makeClient();
    const { settler } = makeSettler(client);

    const result = await settler.settle(makeIntent({ amount: "10" }));

    expect(result.transactionHash).toBe(TX_HASH);
    expect(result.actualInputAmount).toBe("10");
    expect(result.actualOutputAmount).toBe("10");
    expect(result.settlerUsed).toBe(SettlerType.INVENTORY);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an executedRoute with the intent's chain and token info", async () => {
    const client = makeClient();
    const { settler } = makeSettler(client);
    const intent = makeIntent();

    const result = await settler.settle(intent);
    const step = result.executedRoute.steps[0];

    expect(step.fromChain).toBe(intent.fromChain);
    expect(step.toChain).toBe(intent.toChain);
    expect(step.fromToken).toBe(intent.fromToken);
    expect(step.toToken).toBe(intent.toToken);
  });

  it("throws when no client is registered for the destination chain", async () => {
    const { settler } = makeSettler(); // empty map

    await expect(settler.settle(makeIntent())).rejects.toMatchObject({
      code: "NO_CHAIN_CLIENT",
    });
  });

  it("propagates error when transferToken rejects", async () => {
    const client = makeClient();
    client.transferToken.mockRejectedValueOnce(new Error("tx reverted"));
    const { settler } = makeSettler(client);

    await expect(settler.settle(makeIntent())).rejects.toThrow("tx reverted");
  });

  it("propagates error when waitForConfirmation rejects", async () => {
    const client = makeClient();
    client.waitForConfirmation.mockRejectedValueOnce(new Error("confirmation timeout"));
    const { settler } = makeSettler(client);

    await expect(settler.settle(makeIntent())).rejects.toThrow("confirmation timeout");
  });
});

// ---------------------------------------------------------------------------
// type identity
// ---------------------------------------------------------------------------

describe("InventorySettler identity", () => {
  it("has type INVENTORY", () => {
    const { settler } = makeSettler();
    expect(settler.type).toBe(SettlerType.INVENTORY);
  });
});
