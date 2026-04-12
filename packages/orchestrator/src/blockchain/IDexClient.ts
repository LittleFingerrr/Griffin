/**
 * Shared return type for a DEX quote.
 * Every IDexClient implementation must return this shape from getQuote().
 */
export interface DexQuote {
  /** Expected output amount in raw token units (no decimals) */
  amountOut: bigint;
  /** Estimated price impact as a fraction, e.g. 0.003 = 0.3% */
  priceImpact?: number;
  /** Fee taken by the DEX in raw input token units */
  fee?: bigint;
}

// ---------------------------------------------------------------------------

/**
 * Interface every DEX provider must implement.
 *
 * Implementations can be:
 *   - On-chain contract wrappers (e.g. GriffinDexClient calling GriffinDEX.sol)
 *   - HTTP API clients (e.g. OneInchClient, ParaswapClient)
 *
 * SwapSettler depends only on this interface — never on a concrete client.
 *
 * Note: unlike IChainClient (one instance per chain), a DEX client may serve
 * multiple chains through a single API. chainId is therefore passed per-call.
 */
export interface IDexClient {
  /** Human-readable name for logging, e.g. "griffin-dex", "1inch" */
  readonly name: string;

  /**
   * Returns a quote for swapping amountIn of tokenIn to tokenOut on chainId.
   * Returns null if the pair is not supported, the pool has no liquidity,
   * or the provider is unavailable.
   *
   * Must not submit any transaction or have side effects.
   */
  getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    chainId: string,
  ): Promise<DexQuote | null>;

  /**
   * Executes the swap and delivers tokenOut to recipient.
   * Returns a transaction hash (or equivalent settlement identifier).
   *
   * Implementations are responsible for any necessary token approvals
   * before submitting the swap transaction.
   */
  swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    recipient: string,
    chainId: string,
  ): Promise<string>;

  /**
   * Waits for the swap transaction to be confirmed on-chain.
   * For API-based providers this may poll a status endpoint instead.
   */
  waitForConfirmation(txHash: string, chainId: string): Promise<void>;
}
