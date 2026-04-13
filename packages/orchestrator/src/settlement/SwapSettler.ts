import { ethers } from "ethers";
import {
  type ISettler,
  type SettleabilityCheck,
  type SettlementResult,
  SettlerType,
} from "./ISettler";
import { type Intent } from "../types";
import { type IDexClient } from "../blockchain/IDexClient";
import { type IChainClient } from "../blockchain/IChainClient";
import { ChainService } from "../services/ChainService";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { GriffinSupportedTokens } from "../utils/utils";

/** 0.5% default slippage tolerance */
const DEFAULT_SLIPPAGE_BPS = 50n;
const BPS_DENOMINATOR = 10_000n;

export class SwapSettler implements ISettler {
  readonly type = SettlerType.SWAP;

  /**
   * DEX clients keyed by chainId.
   * A single IDexClient may serve multiple chains (API-based providers),
   * but we still key by chainId so canSettle() can find the right one fast.
   */
  private readonly dexClients: Map<string, IDexClient>;

  /**
   * Chain clients keyed by chainId — used for ERC-20 approve before swap.
   */
  private readonly chainClients: Map<string, IChainClient>;

  constructor(dexClients: Map<string, IDexClient>, chainClients: Map<string, IChainClient>) {
    this.dexClients = dexClients;
    this.chainClients = chainClients;

    logger.info("SwapSettler initialised", {
      dexChains: Array.from(dexClients.keys()),
    });
  }

  /**
   * Capable if:
   *   1. We have a DEX client for the destination chain
   *   2. The DEX returns a non-null quote (pool exists and has liquidity)
   *   3. The quoted output is greater than zero
   */
  async canSettle(intent: Intent): Promise<SettleabilityCheck> {
    const dex = this.dexClients.get(intent.toChain);

    if (!dex) {
      return {
        capable: false,
        reason: `No DEX client registered for ${intent.toChain}`,
      };
    }

    const chainService = new ChainService(GriffinSupportedTokens);
    const tokenInfo = await chainService.getTokenInfo(intent.fromToken, intent.fromChain);
    const decimals = tokenInfo?.decimals ?? 18;
    const amountIn = ethers.parseUnits(intent.amount, decimals);

    let quote;
    try {
      quote = await dex.getQuote(intent.fromToken, intent.toToken, amountIn, intent.toChain);
    } catch (err) {
      return {
        capable: false,
        reason: `DEX quote failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!quote || quote.amountOut === 0n) {
      return {
        capable: false,
        reason: "No liquidity available for this pair",
      };
    }

    return { capable: true };
  }

  async settle(intent: Intent): Promise<SettlementResult> {
    const startedAt = Date.now();

    const dex = this.dexClients.get(intent.toChain);
    if (!dex) {
      throw new AppError(`No DEX client for ${intent.toChain}`, 500, "NO_DEX_CLIENT");
    }

    const chainClient = this.chainClients.get(intent.fromChain);
    if (!chainClient) {
      throw new AppError(`No chain client for ${intent.fromChain}`, 500, "NO_CHAIN_CLIENT");
    }

    // Resolve decimals for both tokens
    const chainService = new ChainService(GriffinSupportedTokens);
    const [fromTokenInfo, toTokenInfo] = await Promise.all([
      chainService.getTokenInfo(intent.fromToken, intent.fromChain),
      chainService.getTokenInfo(intent.toToken, intent.toChain),
    ]);
    const fromDecimals = fromTokenInfo?.decimals ?? 18;
    const toDecimals = toTokenInfo?.decimals ?? 18;

    const amountIn = ethers.parseUnits(intent.amount, fromDecimals);

    // Get live quote
    const quote = await dex.getQuote(intent.fromToken, intent.toToken, amountIn, intent.toChain);
    if (!quote || quote.amountOut === 0n) {
      throw new AppError("No liquidity available at settlement time", 500, "NO_LIQUIDITY");
    }

    // Apply slippage: minAmountOut = amountOut * (1 - slippage)
    const minAmountOut =
      (quote.amountOut * (BPS_DENOMINATOR - DEFAULT_SLIPPAGE_BPS)) / BPS_DENOMINATOR;

    logger.info("SwapSettler executing swap", {
      intentId: intent.id,
      fromChain: intent.fromChain,
      toChain: intent.toChain,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amountIn: amountIn.toString(),
      expectedOut: quote.amountOut.toString(),
      minAmountOut: minAmountOut.toString(),
      recipient: intent.recipient,
    });

    // Execute the swap — DEX takes tokenIn from Griffin's wallet, sends tokenOut to recipient
    const txHash = await dex.swap(
      intent.fromToken,
      intent.toToken,
      amountIn,
      minAmountOut,
      intent.recipient,
      intent.toChain,
    );

    await dex.waitForConfirmation(txHash, intent.toChain);

    const durationMs = Date.now() - startedAt;
    const actualOutputAmount = ethers.formatUnits(quote.amountOut, toDecimals);

    logger.info("SwapSettler swap confirmed", {
      intentId: intent.id,
      txHash,
      durationMs,
    });

    return {
      transactionHash: txHash,
      actualInputAmount: intent.amount,
      actualOutputAmount,
      settlerUsed: SettlerType.SWAP,
      executedRoute: {
        id: `swap-${intent.id}`,
        serviceId: `griffin-dex`,
        steps: [
          {
            type: "swap",
            provider: dex.name,
            fromChain: intent.fromChain,
            toChain: intent.toChain,
            fromToken: intent.fromToken,
            toToken: intent.toToken,
            amount: intent.amount,
            estimatedOutput: actualOutputAmount,
            fees: { gasFee: "0", total: "0" },
          },
        ],
        totalCost: "0",
        estimatedTime: Math.round(durationMs / 1000),
        slippageTolerance: Number(DEFAULT_SLIPPAGE_BPS) / Number(BPS_DENOMINATOR),
        gasEstimate: { gasPrice: "0", serviceCost: "0", totalCost: "0" },
        createdAt: new Date(startedAt),
        expiresAt: new Date(startedAt + durationMs),
      },
      durationMs,
    };
  }
}
