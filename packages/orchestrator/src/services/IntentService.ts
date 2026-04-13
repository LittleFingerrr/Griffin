import { v4 as uuidv4 } from "uuid";
import { type Intent, IntentStatus, type CreateIntentRequest } from "../types";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { ChainService } from "./ChainService";
import { validateAddress, validateSignature } from "../utils/utils";
import { type SettlementEngine } from "@/settlement/SettlementEngine";

export class IntentService {
  private intents: Map<string, Intent> = new Map();
  private settlementEngine: SettlementEngine;

  constructor(settlementEngine: SettlementEngine) {
    this.settlementEngine = settlementEngine;
  }

  async createIntent(request: CreateIntentRequest): Promise<Intent> {
    try {
      // Validate intent parameters
      await this.validateIntent(request);

      const intent: Intent = {
        id: uuidv4(),
        userAddress: request.userAddress,
        fromChain: request.fromChain,
        toChain: request.toChain,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        recipient: request.recipient,
        status: IntentStatus.PENDING,
        transactions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      // Store intent (in production, this would be in database)
      this.intents.set(intent.id, intent);

      logger.info("Intent created", {
        intentId: intent.id,
        userAddress: intent.userAddress,
        fromChain: intent.fromChain,
        toChain: intent.toChain,
      });

      return intent;
    } catch (error) {
      logger.error("Failed to create intent", { error, request });
      throw error;
    }
  }

  async getIntent(intentId: string): Promise<Intent | null> {
    return this.intents.get(intentId) || null;
  }

  async executeIntent(intentId: string): Promise<Intent> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new AppError("Intent not found", 404, "INTENT_NOT_FOUND");
    }

    if (intent.status !== IntentStatus.PENDING) {
      throw new AppError("Intent cannot be executed in current status", 400, "INVALID_STATUS");
    }

    // Update status to executing
    intent.status = IntentStatus.EXECUTING;
    intent.updatedAt = new Date();

    logger.info("Intent execution started", { intentId });
    try {
      const result = await this.settlementEngine.settle(intent);

      intent.status = IntentStatus.COMPLETED;
      intent.updatedAt = new Date();
      intent.completedAt = new Date();
      intent.metadata.settlement = result;

      logger.info("Intent completed", { intentId, settler: result.settlerUsed });
    } catch (err) {
      intent.status = IntentStatus.FAILED;
      intent.updatedAt = new Date();
      logger.error("Intent failed", { intentId, err });
      throw err;
    }

    return intent;
  }

  async cancelIntent(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new AppError("Intent not found", 404, "INTENT_NOT_FOUND");
    }

    if (intent.status === IntentStatus.EXECUTING) {
      throw new AppError("Cannot cancel executing intent", 400, "CANNOT_CANCEL");
    }

    intent.status = IntentStatus.CANCELLED;
    intent.updatedAt = new Date();

    logger.info("Intent cancelled", { intentId });
  }

  private async validateIntent(request: CreateIntentRequest): Promise<void> {
    const supportedChains = await ChainService.getSupportedChains();
    const fromChain = supportedChains.find((chain) => chain.chainId === request.fromChain);
    if (!fromChain) {
      throw new AppError("Unsupported source chain", 400, "UNSUPPORTED_CHAIN", {
        chainId: request.fromChain,
      });
    }
    const toChain = supportedChains.find((chain) => chain.chainId === request.toChain);
    if (!toChain) {
      throw new AppError("Unsupported destination chain", 400, "UNSUPPORTED_CHAIN", {
        chainId: request.toChain,
      });
    }

    // Validate amount
    const amount = parseFloat(request.amount);
    if (amount <= 0) {
      throw new AppError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
    }

    const isValidSenderAddress = validateAddress(request.fromChain, request.userAddress);
    if (!isValidSenderAddress) {
      throw new AppError("Sender address not too valid on chain", 400, "INVALID_ADDRESS");
    }

    const isValidRecipientAddress = validateAddress(request.toChain, request.recipient);
    if (!isValidRecipientAddress) {
      throw new AppError("Recipient address not valid on chain", 400, "INVALID_ADDRESS");
    }

    const isValidInputTokenAddress = validateAddress(request.fromChain, request.fromToken);
    if (!isValidInputTokenAddress) {
      throw new AppError("Input token address not valid on chain", 400, "INVALID_ADDRESS");
    }

    const isValidOutputTokenAddress = validateAddress(request.toChain, request.toToken);
    if (!isValidOutputTokenAddress) {
      throw new AppError("Output token address not valid on chain", 400, "INVALID_ADDRESS");
    }

    // Additional validations would go here:
    // - Signature validation (if provided)
    if (!request.requestSignature) {
      throw new AppError("No signature provided", 400, "MISSING_SIGNATURE");
    }
    const isValidSignature = validateSignature(
      request.fromChain,
      request.requestSignature,
      request.requestMessage,
      request.userAddress,
    );
    if (!isValidSignature) {
      throw new AppError("Invalid signature", 400, "INVALID_SIGNATURE");
    }
  }
}
