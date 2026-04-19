/**
 * A single step within a bridge route.
 * Bridges often require multiple on-chain transactions (e.g. approve + bridge).
 */
export interface BridgeStep {
  /** Step index within the route (0-based) */
  index: number;
  /** Human-readable description, e.g. "Approve USDC" or "Bridge via Superbridge" */
  description: string;
  /** Chain this step is executed on */
  chainId: string;
  /** Whether this step requires an ERC-20 approval before execution */
  requiresApproval: boolean;
}

/**
 * A bridge route returned by getRoutes().
 * Represents one provider's offer to move tokens cross-chain.
 */
export interface BridgeRoute {
  /** Opaque route identifier — pass back to getStepTransaction() */
  routeId: string;
  /** Provider name, e.g. "superbridge", "across", "hop" */
  provider: string;
  /** Source chain */
  fromChain: string;
  /** Destination chain */
  toChain: string;
  /** Token address on source chain */
  fromToken: string;
  /** Token address on destination chain */
  toToken: string;
  /** Input amount in raw token units */
  amountIn: string;
  /** Expected output amount in raw token units */
  amountOut: string;
  /** Estimated time for the bridge to complete, in seconds */
  estimatedTimeSeconds: number;
  /** Total fees in USD (approximate) */
  feesUsd: string;
  /** Ordered list of steps the user must execute */
  steps: BridgeStep[];
}

/**
 * The calldata needed to execute one step of a bridge route.
 */
export interface BridgeStepTransaction {
  /** Chain to submit this transaction on */
  chainId: string;
  /** Contract to call */
  to: string;
  /** Encoded calldata */
  data: string;
  /** Native value to send with the transaction (in wei) */
  value: string;
  /** Gas limit estimate */
  gasLimit?: string;
}

// ---------------------------------------------------------------------------

/**
 * Interface every bridge provider client must implement.
 *
 * Implementations can be:
 *   - SDK wrappers (e.g. SuperbridgeClient using @superbridge-app/sdk)
 *   - HTTP API clients (e.g. AcrossClient, HopClient)
 *
 * BridgeSettler depends only on this interface — never on a concrete client.
 *
 * Unlike IDexClient, bridge clients are inherently cross-chain so chainId
 * is part of the route rather than a per-call parameter.
 */
export interface IBridgeClient {
  /** Human-readable name for logging, e.g. "superbridge", "across" */
  readonly name: string;

  /**
   * Returns available bridge routes for moving `amount` of `fromToken`
   * on `fromChain` to `toToken` on `toChain`.
   *
   * Returns an empty array if no routes are available.
   * Must not submit any transaction or have side effects.
   */
  getRoutes(
    fromChain: string,
    toChain: string,
    fromToken: string,
    toToken: string,
    amount: string,
  ): Promise<BridgeRoute[]>;

  /**
   * Returns the transaction calldata needed to execute a specific step
   * of a previously fetched route.
   *
   * @param routeId   - The routeId from a BridgeRoute
   * @param stepIndex - Which step to build the transaction for
   * @param sender    - Address submitting the transaction (Griffin's operator wallet)
   * @param recipient - Final destination address for the bridged tokens
   */
  getStepTransaction(
    routeId: string,
    stepIndex: number,
    sender: string,
    recipient: string,
  ): Promise<BridgeStepTransaction>;

  /**
   * Waits for a bridge transaction to be fully confirmed on the destination chain.
   * For multi-step bridges this should be called after the final step.
   *
   * @param txHash    - Transaction hash of the submitted bridge transaction
   * @param fromChain - Source chain ID
   * @param toChain   - Destination chain ID
   */
  waitForCompletion(txHash: string, fromChain: string, toChain: string): Promise<void>;
}
