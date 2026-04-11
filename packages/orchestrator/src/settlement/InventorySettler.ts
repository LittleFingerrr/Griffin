import { ethers } from "ethers";
import {
  type ISettler,
  type SettleabilityCheck,
  type SettlementResult,
  SettlerType,
} from "./ISettler";
import { type Intent } from "../types";
import { type IChainClient } from "../blockchain/IChainClient";
import { ChainService } from "@/services/ChainService";
import { AppError } from "@/middleware/errorHandler";
import { logger } from "@/utils/logger";

export class InventorySettler implements ISettler {
  readonly type = SettlerType.INVENTORY;

  /**
   * Map of chainId → client.
   * e.g. { "eip155:133": evmClient }
   */
  private readonly clients: Map<string, IChainClient>;

  /** Griffin's vault address — the wallet that holds the inventory */
  private readonly vaultAddress: string;

  constructor(clients: Map<string, IChainClient>, vaultAddress: string) {
    this.clients = clients;
    this.vaultAddress = vaultAddress;

    logger.info("InventorySettler initialised", {
      chains: Array.from(clients.keys()),
      vaultAddress,
    });
  }

  /**
   * Capable if:
   *   1. We have a client for the destination chain
   *   2. Griffin's vault holds enough of the output token to cover the intent amount
   */
  async canSettle(intent: Intent): Promise<SettleabilityCheck> {
    const client = this.clients.get(intent.toChain);

    if (!client) {
      return {
        capable: false,
        reason: `No chain client registered for ${intent.toChain}`,
      };
    }

    let balance: bigint;
    try {
      balance = await client.getTokenBalance(intent.toToken, this.vaultAddress);
    } catch (err) {
      return {
        capable: false,
        reason: `Failed to fetch vault balance: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const required = ethers.parseUnits(intent.amount, 18); // TODO: use actual token decimals

    if (balance < required) {
      return {
        capable: false,
        reason: `Insufficient vault balance: have ${balance.toString()}, need ${required.toString()}`,
      };
    }

    return { capable: true };
  }

  async settle(intent: Intent): Promise<SettlementResult> {
    const startedAt = Date.now();

    const client = this.clients.get(intent.toChain);
    if (!client) {
      throw new AppError(`No chain client for ${intent.toChain}`, 500, "NO_CHAIN_CLIENT");
    }

    // Resolve token decimals from ChainService so we parse the amount correctly
    const chainService = new ChainService();
    const tokenInfo = await chainService.getTokenInfo(intent.toToken, intent.toChain);
    const decimals = tokenInfo?.decimals ?? 18; // fall back to 18 if unknown

    const rawAmount = ethers.parseUnits(intent.amount, decimals);

    logger.info("InventorySettler executing transfer", {
      intentId: intent.id,
      toChain: intent.toChain,
      toToken: intent.toToken,
      recipient: intent.recipient,
      amount: intent.amount,
      decimals,
    });

    // Transfer the output token directly from Griffin's vault to the recipient
    const txHash = await client.transferToken(intent.toToken, intent.recipient, rawAmount);

    // Wait for on-chain confirmation before declaring success
    await client.waitForConfirmation(txHash);

    const durationMs = Date.now() - startedAt;

    logger.info("InventorySettler transfer confirmed", {
      intentId: intent.id,
      txHash,
      durationMs,
    });

    return {
      transactionHash: txHash,
      actualInputAmount: intent.amount,
      actualOutputAmount: intent.amount, // 1:1 — inventory model has no slippage
      settlerUsed: SettlerType.INVENTORY,
      executedRoute: {
        id: `inventory-${intent.id}`,
        serviceId: "griffin-inventory",
        steps: [
          {
            type: "bridge",
            provider: "griffin-inventory",
            fromChain: intent.fromChain,
            toChain: intent.toChain,
            fromToken: intent.fromToken,
            toToken: intent.toToken,
            amount: intent.amount,
            estimatedOutput: intent.amount,
            fees: { gasFee: "0", total: "0" },
          },
        ],
        totalCost: "0",
        estimatedTime: Math.round(durationMs / 1000),
        slippageTolerance: 0,
        gasEstimate: { gasPrice: "0", serviceCost: "0", totalCost: "0" },
        createdAt: new Date(startedAt),
        expiresAt: new Date(startedAt + durationMs),
      },
      durationMs,
    };
  }
}
