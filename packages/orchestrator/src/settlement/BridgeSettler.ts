import { ethers } from "ethers";
import {
  type ISettler,
  type SettleabilityCheck,
  type SettlementResult,
  SettlerType,
} from "./ISettler";
import { type Intent } from "../types";
import { type IBridgeClient, type BridgeRoute } from "../blockchain/IBridgeClient";
import { type IChainClient } from "../blockchain/IChainClient";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export class BridgeSettler implements ISettler {
  readonly type = SettlerType.BRIDGE;

  /**
   * Bridge clients — one or more providers (e.g. Superbridge, Across).
   * BridgeSettler tries them in order and uses the first that returns routes.
   */
  private readonly bridgeClients: IBridgeClient[];

  /**
   * Chain clients keyed by chainId — used to sign and submit transactions.
   * The bridge client gives us calldata; the chain client submits it.
   */
  private readonly chainClients: Map<string, IChainClient>;

  /** Griffin's operator wallet address — used as sender in bridge requests */
  private readonly senderAddress: string;

  constructor(
    bridgeClients: IBridgeClient[],
    chainClients: Map<string, IChainClient>,
    senderAddress: string,
  ) {
    this.bridgeClients = bridgeClients;
    this.chainClients = chainClients;
    this.senderAddress = senderAddress;

    logger.info("BridgeSettler initialised", {
      providers: bridgeClients.map((b) => b.name),
      chains: Array.from(chainClients.keys()),
    });
  }

  /**
   * Capable if:
   *   1. fromChain !== toChain (bridge is only for cross-chain)
   *   2. We have a chain client for the source chain (to submit the tx)
   *   3. At least one bridge provider returns a route
   */
  async canSettle(intent: Intent): Promise<SettleabilityCheck> {
    if (intent.fromChain === intent.toChain) {
      return {
        capable: false,
        reason: "Same-chain intent — use SwapSettler instead",
      };
    }

    if (!this.chainClients.has(intent.fromChain)) {
      return {
        capable: false,
        reason: `No chain client registered for source chain ${intent.fromChain}`,
      };
    }

    for (const bridge of this.bridgeClients) {
      try {
        const routes = await bridge.getRoutes(
          intent.fromChain,
          intent.toChain,
          intent.fromToken,
          intent.toToken,
          intent.amount,
        );

        if (routes.length > 0) {
          return { capable: true };
        }
      } catch (err) {
        logger.debug("Bridge provider returned no routes", {
          provider: bridge.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      capable: false,
      reason: "No bridge routes available for this pair",
    };
  }

  async settle(intent: Intent): Promise<SettlementResult> {
    const startedAt = Date.now();

    const chainClient = this.chainClients.get(intent.fromChain);
    if (!chainClient) {
      throw new AppError(
        `No chain client for source chain ${intent.fromChain}`,
        500,
        "NO_CHAIN_CLIENT",
      );
    }

    // Find the best route across all providers
    const { bridge, route } = await this.findBestRoute(intent);

    logger.info("BridgeSettler executing bridge", {
      intentId: intent.id,
      provider: bridge.name,
      routeId: route.routeId,
      fromChain: intent.fromChain,
      toChain: intent.toChain,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amount: intent.amount,
      recipient: intent.recipient,
      estimatedTimeSeconds: route.estimatedTimeSeconds,
    });

    // Execute each step in order
    let initiatingTxHash = "";

    for (let i = 0; i < route.steps.length; i++) {
      const step = route.steps[i];

      const stepTx = await bridge.getStepTransaction(
        route.routeId,
        i,
        this.senderAddress,
        intent.recipient,
      );

      logger.info("BridgeSettler submitting step", {
        intentId: intent.id,
        stepIndex: i,
        description: step.description,
        chainId: stepTx.chainId,
        to: stepTx.to,
      });

      // Submit the transaction via the chain client's provider + signer
      const txHash = await this.submitTransaction(chainClient, stepTx);

      logger.info("BridgeSettler step submitted", {
        intentId: intent.id,
        stepIndex: i,
        txHash,
      });

      // Wait for on-chain confirmation of this step before proceeding
      await chainClient.waitForConfirmation(txHash);

      // The first non-approval step is the initiating bridge transaction
      if (!step.requiresApproval && !initiatingTxHash) {
        initiatingTxHash = txHash;
      }
    }

    // Wait for the bridge to complete on the destination chain
    await bridge.waitForCompletion(initiatingTxHash, intent.fromChain, intent.toChain);

    const durationMs = Date.now() - startedAt;

    logger.info("BridgeSettler bridge complete", {
      intentId: intent.id,
      txHash: initiatingTxHash,
      durationMs,
    });

    return {
      transactionHash: initiatingTxHash,
      actualInputAmount: intent.amount,
      actualOutputAmount: route.amountOut,
      settlerUsed: SettlerType.BRIDGE,
      executedRoute: {
        id: `bridge-${intent.id}`,
        serviceId: bridge.name,
        steps: route.steps.map((s) => ({
          type: "bridge" as const,
          provider: bridge.name,
          fromChain: intent.fromChain,
          toChain: intent.toChain,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount,
          estimatedOutput: route.amountOut,
          fees: { gasFee: "0", total: route.feesUsd },
        })),
        totalCost: route.feesUsd,
        estimatedTime: route.estimatedTimeSeconds,
        slippageTolerance: 0,
        gasEstimate: { gasPrice: "0", serviceCost: "0", totalCost: "0" },
        createdAt: new Date(startedAt),
        expiresAt: new Date(startedAt + durationMs),
      },
      durationMs,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async findBestRoute(
    intent: Intent,
  ): Promise<{ bridge: IBridgeClient; route: BridgeRoute }> {
    for (const bridge of this.bridgeClients) {
      const routes = await bridge.getRoutes(
        intent.fromChain,
        intent.toChain,
        intent.fromToken,
        intent.toToken,
        intent.amount,
      );

      if (routes.length > 0) {
        // Pick the route with the highest amountOut (best deal for recipient)
        const best = routes.reduce((a, b) =>
          BigInt(b.amountOut) > BigInt(a.amountOut) ? b : a,
        );
        return { bridge, route: best };
      }
    }

    throw new AppError("No bridge routes available at settlement time", 500, "NO_BRIDGE_ROUTE");
  }

  /**
   * Submits a raw transaction using the chain client's underlying provider.
   * The chain client holds the signer — we just need to send the calldata.
   */
  private async submitTransaction(
    chainClient: IChainClient,
    stepTx: { to: string; data: string; value: string; gasLimit?: string },
  ): Promise<string> {
    // IChainClient doesn't expose a raw sendTransaction — we reach into the
    // EvmClient's provider via a duck-typed check. If the client exposes a
    // sendRawTransaction method we use it; otherwise we fall back to transferToken
    // for approval steps (value = 0, data = ERC-20 approve calldata).
    //
    // TODO: Add sendTransaction(to, data, value) to IChainClient when the
    // interface is next revised — this avoids the duck-type cast.
    const client = chainClient as unknown as {
      signer?: ethers.Wallet;
      provider?: ethers.JsonRpcProvider;
    };

    if (!client.signer) {
      throw new AppError(
        "Chain client does not expose a signer for raw transaction submission",
        500,
        "NO_SIGNER",
      );
    }

    const tx = await client.signer.sendTransaction({
      to: stepTx.to,
      data: stepTx.data,
      value: BigInt(stepTx.value),
      ...(stepTx.gasLimit ? { gasLimit: BigInt(stepTx.gasLimit) } : {}),
    });

    return tx.hash;
  }
}
