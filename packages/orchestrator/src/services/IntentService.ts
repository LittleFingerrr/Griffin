import { v4 as uuidv4 } from "uuid";
import { Intent, IntentStatus, CreateIntentRequest, QuoteRequest } from "../types";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { ChainService } from "./ChainService";
// import { validateAndParseAddress } from "starknet";
import { executeStellarSwap, validateAddress, validateSignature } from "@/utils/utils";
import { RouteService } from "./RouteService";

const routeService = new RouteService();

export class IntentService {
  private intents: Map<string, Intent> = new Map(); // intend_id => intent

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
      throw new AppError(
        "Intent cannot be executed in current status",
        400,
        "INVALID_STATUS",
      );
    }

    // Update status to executing
    intent.status = IntentStatus.EXECUTING;
    intent.updatedAt = new Date();

    logger.info("Intent execution started", { intentId });

    const quoteRequest: QuoteRequest = {
      fromChain: intent.fromChain,
      toChain: intent.toChain,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amount: intent.amount,
      slippageTolerance: 0.05
    }

    // TODO: VERIFY PAYMENT -> DEPENDING ON HOW SDK BILLS USER
    // OR USE THE SIGNED MESSAGE, SUBMIT IT TO A CONTRACT THAT ALLOWS THAT AND TRANSFER
    // VERIFY THAT THE PAYMENT HAS HAPPENED, IN CASE USER BALANCE IS INSUFFICIENT

    const bestRoutes = await routeService.findBestRoutes(quoteRequest);

    // TODO: IMPLEMENT MORE ROBUST LOGIC FOR SELECTING BEST ROUTE
    const selectedRoute = bestRoutes[0];

    // TODO: Replace executeAvnuSwap with Stellar swap
    // @ts-expect-error
    const {} = executeAvnuSwap(selectedRoute);

    // TODO: Implement actual execution logic
    // This would involve:
    // 1. Verify payment
    // 2. Find best route
    // 3. Execute bridge/swap
    // 4. Monitor completion

    return intent;
  }

  async cancelIntent(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new AppError("Intent not found", 404, "INTENT_NOT_FOUND");
    }

    if (intent.status === IntentStatus.EXECUTING) {
      throw new AppError(
        "Cannot cancel executing intent",
        400,
        "CANNOT_CANCEL",
      );
    }

    intent.status = IntentStatus.CANCELLED;
    intent.updatedAt = new Date();

    logger.info("Intent cancelled", { intentId });
  }

  private async validateIntent(request: CreateIntentRequest): Promise<void> {
    const supportedChains = await ChainService.getSupportedChains();
    const fromChain = supportedChains.find(
      (chain) => chain.chainId === request.fromChain,
    );
    if (!fromChain) {
      throw new AppError("Unsupported source chain", 400, "UNSUPPORTED_CHAIN", {
        chainId: request.fromChain,
      });
    }
    const toChain = supportedChains.find(
      (chain) => chain.chainId === request.toChain,
    );
    if (!toChain) {
      throw new AppError(
        "Unsupported destination chain",
        400,
        "UNSUPPORTED_CHAIN",
        { chainId: request.toChain },
      );
    }

    // Validate amount
    const amount = parseFloat(request.amount);
    if (amount <= 0) {
      throw new AppError(
        "Amount must be greater than zero",
        400,
        "INVALID_AMOUNT",
      );
    }

    const isValidSenderAddress = validateAddress(
      request.fromChain,
      request.userAddress,
    );
    if (!isValidSenderAddress) {
      throw new AppError(
        "Sender address not valid on chain",
        400,
        "INVALID_ADDRESS",
      );
    }

    const isValidRecipientAddress = validateAddress(
      request.toChain,
      request.recipient,
    );
    if (!isValidRecipientAddress) {
      throw new AppError(
        "Sender address not valid on chain",
        400,
        "INVALID_ADDRESS",
      );
    }

    const isValidInputTokenAddress = validateAddress(
      request.fromChain,
      request.fromToken,
    );
    if (!isValidInputTokenAddress) {
      throw new AppError(
        "Sender address not valid on chain",
        400,
        "INVALID_ADDRESS",
      );
    }

    const isValidOutputTokenAddress = validateAddress(
      request.toChain,
      request.toToken,
    );
    if (!isValidOutputTokenAddress) {
      throw new AppError(
        "Sender address not valid on chain",
        400,
        "INVALID_ADDRESS",
      );
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
    // TODO: Use isValidSignature result, not duplicate check
    if (!request.requestSignature) {
      throw new AppError("Invalid signature", 400, "MISSING_SIGNATURE");
    }
  }
}
