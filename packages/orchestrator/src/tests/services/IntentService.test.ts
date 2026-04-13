import { IntentService } from "../../services/IntentService";
import { SettlementEngine } from "../../settlement/SettlementEngine";
import { SettlementResult, SettlerType } from "../../settlement/ISettler";
import { CreateIntentRequest, IntentStatus, RouteInfo } from "../../types";
import * as utils from "../../utils/utils";

// Stub out external calls
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

const mockRoute: RouteInfo = {
  id: "route-1",
  serviceId: "svc-1",
  steps: [],
  totalCost: "0.01",
  estimatedTime: 120,
  slippageTolerance: 0.01,
  gasEstimate: { gasPrice: "100", serviceCost: "0", totalCost: "0.01" },
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 300_000),
};

const mockSettlementResult: SettlementResult = {
  transactionHash: "0xabc123",
  actualInputAmount: "100",
  actualOutputAmount: "99",
  settlerUsed: SettlerType.SWAP,
  executedRoute: mockRoute,
  durationMs: 500,
};

const makeEngine = (result?: SettlementResult, shouldThrow?: Error) => {
  const engine = {
    settle: jest.fn(),
    getRegisteredSettlers: jest.fn().mockReturnValue([SettlerType.SWAP]),
  } as unknown as SettlementEngine;

  if (shouldThrow) {
    (engine.settle as jest.Mock).mockRejectedValue(shouldThrow);
  } else {
    (engine.settle as jest.Mock).mockResolvedValue(result ?? mockSettlementResult);
  }

  return engine;
};

const validRequest: CreateIntentRequest = {
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

describe("IntentService.createIntent", () => {
  let service: IntentService;

  beforeEach(() => {
    service = new IntentService(makeEngine());
  });

  it("creates an intent with PENDING status", async () => {
    const intent = await service.createIntent(validRequest);
    expect(intent.status).toBe(IntentStatus.PENDING);
  });

  it("assigns a UUID id", async () => {
    const intent = await service.createIntent(validRequest);
    expect(intent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("stores intent fields from request", async () => {
    const intent = await service.createIntent(validRequest);
    expect(intent.fromChain).toBe(validRequest.fromChain);
    expect(intent.toChain).toBe(validRequest.toChain);
    expect(intent.amount).toBe(validRequest.amount);
    expect(intent.recipient).toBe(validRequest.recipient);
    expect(intent.userAddress).toBe(validRequest.userAddress);
  });

  it("starts with empty transactions array", async () => {
    const intent = await service.createIntent(validRequest);
    expect(intent.transactions).toEqual([]);
  });

  it("throws INVALID_AMOUNT for zero amount", async () => {
    await expect(service.createIntent({ ...validRequest, amount: "0" })).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
  });

  it("throws INVALID_AMOUNT for negative amount", async () => {
    await expect(service.createIntent({ ...validRequest, amount: "-5" })).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
  });

  it("throws UNSUPPORTED_CHAIN for unknown fromChain", async () => {
    await expect(
      service.createIntent({ ...validRequest, fromChain: "unknown:chain" }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
  });

  it("throws UNSUPPORTED_CHAIN for unknown toChain", async () => {
    await expect(
      service.createIntent({ ...validRequest, toChain: "unknown:chain" }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
  });

  it("throws MISSING_SIGNATURE when no signature provided", async () => {
    await expect(
      service.createIntent({ ...validRequest, requestSignature: undefined }),
    ).rejects.toMatchObject({ code: "MISSING_SIGNATURE" });
  });

  it("throws INVALID_ADDRESS when validateAddress returns false", async () => {
    (utils.validateAddress as jest.Mock).mockReturnValueOnce(false);
    await expect(service.createIntent(validRequest)).rejects.toMatchObject({
      code: "INVALID_ADDRESS",
    });
  });
});

describe("IntentService.getIntent", () => {
  let service: IntentService;

  beforeEach(() => {
    service = new IntentService(makeEngine());
  });

  it("returns null for unknown id", async () => {
    expect(await service.getIntent("nonexistent")).toBeNull();
  });

  it("returns intent after creation", async () => {
    const created = await service.createIntent(validRequest);
    const fetched = await service.getIntent(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });
});

describe("IntentService.executeIntent", () => {
  let service: IntentService;

  beforeEach(() => {
    service = new IntentService(makeEngine());
  });

  it("throws INTENT_NOT_FOUND for unknown id", async () => {
    await expect(service.executeIntent("bad-id")).rejects.toMatchObject({
      code: "INTENT_NOT_FOUND",
    });
  });

  it("throws INVALID_STATUS if intent is not PENDING", async () => {
    const intent = await service.createIntent(validRequest);
    // Force status to COMPLETED
    (intent as any).status = IntentStatus.COMPLETED;

    await expect(service.executeIntent(intent.id)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
  });

  it("marks intent COMPLETED on successful settlement", async () => {
    const intent = await service.createIntent(validRequest);
    const result = await service.executeIntent(intent.id);
    expect(result.status).toBe(IntentStatus.COMPLETED);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it("stores settlement result in metadata", async () => {
    const intent = await service.createIntent(validRequest);
    const result = await service.executeIntent(intent.id);
    expect(result.metadata.settlement).toMatchObject({
      transactionHash: "0xabc123",
      settlerUsed: SettlerType.SWAP,
    });
  });

  it("marks intent FAILED and rethrows when settlement throws", async () => {
    const engine = makeEngine(undefined, new Error("settler failed"));
    service = new IntentService(engine);

    const intent = await service.createIntent(validRequest);
    await expect(service.executeIntent(intent.id)).rejects.toThrow("settler failed");

    const failed = await service.getIntent(intent.id);
    expect(failed!.status).toBe(IntentStatus.FAILED);
  });
});

describe("IntentService.cancelIntent", () => {
  let service: IntentService;

  beforeEach(() => {
    service = new IntentService(makeEngine());
  });

  it("throws INTENT_NOT_FOUND for unknown id", async () => {
    await expect(service.cancelIntent("bad-id")).rejects.toMatchObject({
      code: "INTENT_NOT_FOUND",
    });
  });

  it("cancels a PENDING intent", async () => {
    const intent = await service.createIntent(validRequest);
    await service.cancelIntent(intent.id);
    const fetched = await service.getIntent(intent.id);
    expect(fetched!.status).toBe(IntentStatus.CANCELLED);
  });

  it("throws CANNOT_CANCEL when intent is EXECUTING", async () => {
    const intent = await service.createIntent(validRequest);
    (intent as any).status = IntentStatus.EXECUTING;

    await expect(service.cancelIntent(intent.id)).rejects.toMatchObject({
      code: "CANNOT_CANCEL",
    });
  });
});
