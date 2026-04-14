import { BridgeSettler } from "../../settlement/BridgeSettler";
import { SettlerType } from "../../settlement/ISettler";
import { type IBridgeClient, type BridgeRoute, type BridgeStepTransaction } from "../../blockchain/IBridgeClient";
import { type IChainClient } from "../../blockchain/IChainClient";
import { type Intent, IntentStatus } from "../../types";
import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FROM_CHAIN = "eip155:1";
const TO_CHAIN   = "eip155:133";
const FROM_TOKEN = "0xFromToken";
const TO_TOKEN   = "0xToToken";
const RECIPIENT  = "0xRecipient";
const SENDER     = "0xSender";
const TX_HASH    = "0xbridgehash";
const ROUTE_ID   = "route-abc";

const makeIntent = (overrides: Partial<Intent> = {}): Intent => ({
  id: "intent-1",
  userAddress: SENDER,
  fromChain: FROM_CHAIN,
  toChain: TO_CHAIN,
  fromToken: FROM_TOKEN,
  toToken: TO_TOKEN,
  amount: "1000000000000000000",
  recipient: RECIPIENT,
  status: IntentStatus.PENDING,
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
  ...overrides,
});

const makeRoute = (overrides: Partial<BridgeRoute> = {}): BridgeRoute => ({
  routeId: ROUTE_ID,
  provider: "superbridge",
  fromChain: FROM_CHAIN,
  toChain: TO_CHAIN,
  fromToken: FROM_TOKEN,
  toToken: TO_TOKEN,
  amountIn: "1000000000000000000",
  amountOut: "990000000000000000",
  estimatedTimeSeconds: 300,
  feesUsd: "1.50",
  steps: [
    { index: 0, description: "Bridge via superbridge", chainId: FROM_CHAIN, requiresApproval: false },
  ],
  ...overrides,
});

const makeStepTx = (): BridgeStepTransaction => ({
  chainId: FROM_CHAIN,
  to: "0xBridgeContract",
  data: "0xcalldata",
  value: "0",
});

const makeBridgeClient = (routes: BridgeRoute[] = [makeRoute()]): jest.Mocked<IBridgeClient> => ({
  name: "superbridge",
  getRoutes: jest.fn().mockResolvedValue(routes),
  getStepTransaction: jest.fn().mockResolvedValue(makeStepTx()),
  waitForCompletion: jest.fn().mockResolvedValue(undefined),
});

const makeChainClient = (): jest.Mocked<IChainClient> & { signer: jest.Mocked<ethers.Wallet> } => {
  const mockSigner = {
    sendTransaction: jest.fn().mockResolvedValue({ hash: TX_HASH }),
  } as unknown as jest.Mocked<ethers.Wallet>;

  return {
    chainId: FROM_CHAIN,
    getTokenBalance: jest.fn().mockResolvedValue(0n),
    transferToken: jest.fn().mockResolvedValue(TX_HASH),
    waitForConfirmation: jest.fn().mockResolvedValue(undefined),
    signer: mockSigner,
  };
};

const makeSettler = (
  bridgeClients: IBridgeClient[] = [makeBridgeClient()],
  chainClient?: ReturnType<typeof makeChainClient>,
) => {
  const chainMap = new Map<string, IChainClient>();
  const client = chainClient ?? makeChainClient();
  chainMap.set(FROM_CHAIN, client as unknown as IChainClient);
  return {
    settler: new BridgeSettler(bridgeClients, chainMap, SENDER),
    chainClient: client,
  };
};

// ---------------------------------------------------------------------------
// canSettle
// ---------------------------------------------------------------------------

describe("BridgeSettler.canSettle", () => {
  it("declines same-chain intents", async () => {
    const { settler } = makeSettler();
    const result = await settler.canSettle(makeIntent({ fromChain: FROM_CHAIN, toChain: FROM_CHAIN }));
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/Same-chain/);
  });

  it("declines when no chain client for source chain", async () => {
    const settler = new BridgeSettler([makeBridgeClient()], new Map(), SENDER);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No chain client/);
  });

  it("declines when all bridge clients return empty routes", async () => {
    const bridge = makeBridgeClient([]);
    const { settler } = makeSettler([bridge]);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No bridge routes/);
  });

  it("declines when bridge client throws", async () => {
    const bridge = makeBridgeClient();
    bridge.getRoutes.mockRejectedValueOnce(new Error("API down"));
    const { settler } = makeSettler([bridge]);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/No bridge routes/);
  });

  it("returns capable=true when a route is available", async () => {
    const { settler } = makeSettler();
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(true);
  });

  it("tries multiple providers and succeeds if second has routes", async () => {
    const noRoutes = makeBridgeClient([]);
    const hasRoutes = makeBridgeClient([makeRoute()]);
    const { settler } = makeSettler([noRoutes, hasRoutes]);
    const result = await settler.canSettle(makeIntent());
    expect(result.capable).toBe(true);
  });

  it("calls getRoutes with correct intent fields", async () => {
    const bridge = makeBridgeClient();
    const { settler } = makeSettler([bridge]);
    const intent = makeIntent();
    await settler.canSettle(intent);
    expect(bridge.getRoutes).toHaveBeenCalledWith(
      FROM_CHAIN, TO_CHAIN, FROM_TOKEN, TO_TOKEN, intent.amount,
    );
  });
});

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

describe("BridgeSettler.settle", () => {
  it("throws NO_CHAIN_CLIENT when source chain client is missing", async () => {
    const settler = new BridgeSettler([makeBridgeClient()], new Map(), SENDER);
    await expect(settler.settle(makeIntent())).rejects.toMatchObject({ code: "NO_CHAIN_CLIENT" });
  });

  it("throws NO_BRIDGE_ROUTE when no provider has routes at settlement time", async () => {
    const bridge = makeBridgeClient([]);
    const { settler } = makeSettler([bridge]);
    await expect(settler.settle(makeIntent())).rejects.toMatchObject({ code: "NO_BRIDGE_ROUTE" });
  });

  it("calls getStepTransaction with correct args", async () => {
    const bridge = makeBridgeClient();
    const { settler } = makeSettler([bridge]);
    await settler.settle(makeIntent());
    expect(bridge.getStepTransaction).toHaveBeenCalledWith(ROUTE_ID, 0, SENDER, RECIPIENT);
  });

  it("calls waitForConfirmation after each step", async () => {
    const bridge = makeBridgeClient();
    const { settler, chainClient } = makeSettler([bridge]);
    await settler.settle(makeIntent());
    expect(chainClient.waitForConfirmation).toHaveBeenCalledWith(TX_HASH);
  });

  it("calls waitForCompletion with initiating tx hash", async () => {
    const bridge = makeBridgeClient();
    const { settler } = makeSettler([bridge]);
    const intent = makeIntent();
    await settler.settle(intent);
    expect(bridge.waitForCompletion).toHaveBeenCalledWith(TX_HASH, FROM_CHAIN, TO_CHAIN);
  });

  it("returns SettlementResult with correct shape", async () => {
    const { settler } = makeSettler();
    const result = await settler.settle(makeIntent());
    expect(result.transactionHash).toBe(TX_HASH);
    expect(result.settlerUsed).toBe(SettlerType.BRIDGE);
    expect(result.actualInputAmount).toBe("1000000000000000000");
    expect(result.actualOutputAmount).toBe("990000000000000000");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("picks the route with the highest amountOut across multiple routes", async () => {
    const lowRoute  = makeRoute({ routeId: "low",  amountOut: "900000000000000000" });
    const highRoute = makeRoute({ routeId: "high", amountOut: "990000000000000000" });
    const bridge = makeBridgeClient([lowRoute, highRoute]);
    const { settler } = makeSettler([bridge]);
    const result = await settler.settle(makeIntent());
    // getStepTransaction should be called with the high-amountOut route
    expect(bridge.getStepTransaction).toHaveBeenCalledWith("high", 0, SENDER, RECIPIENT);
    expect(result.actualOutputAmount).toBe("990000000000000000");
  });

  it("executes approval step before bridge step", async () => {
    const routeWithApproval = makeRoute({
      steps: [
        { index: 0, description: "Approve token", chainId: FROM_CHAIN, requiresApproval: true },
        { index: 1, description: "Bridge", chainId: FROM_CHAIN, requiresApproval: false },
      ],
    });
    const bridge = makeBridgeClient([routeWithApproval]);
    bridge.getStepTransaction
      .mockResolvedValueOnce({ ...makeStepTx(), to: "0xApproveContract" })
      .mockResolvedValueOnce({ ...makeStepTx(), to: "0xBridgeContract" });

    const { settler, chainClient } = makeSettler([bridge]);
    await settler.settle(makeIntent());

    expect(bridge.getStepTransaction).toHaveBeenCalledTimes(2);
    expect(chainClient.waitForConfirmation).toHaveBeenCalledTimes(2);
  });

  it("propagates error when getStepTransaction throws", async () => {
    const bridge = makeBridgeClient();
    bridge.getStepTransaction.mockRejectedValueOnce(new Error("step tx failed"));
    const { settler } = makeSettler([bridge]);
    await expect(settler.settle(makeIntent())).rejects.toThrow("step tx failed");
  });

  it("propagates error when waitForCompletion throws", async () => {
    const bridge = makeBridgeClient();
    bridge.waitForCompletion.mockRejectedValueOnce(new Error("bridge timeout"));
    const { settler } = makeSettler([bridge]);
    await expect(settler.settle(makeIntent())).rejects.toThrow("bridge timeout");
  });
});

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

describe("BridgeSettler identity", () => {
  it("has type BRIDGE", () => {
    const { settler } = makeSettler();
    expect(settler.type).toBe(SettlerType.BRIDGE);
  });
});
