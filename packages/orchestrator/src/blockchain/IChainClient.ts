/**
 * Minimal interface every chain client must implement.
 * Settlers depend on this — never on a concrete client directly.
 */
export interface IChainClient {
  /** The chain ID this client is connected to, e.g. "eip155:133" */
  readonly chainId: string;

  /**
   * Returns the ERC-20 (or equivalent) token balance of an address.
   * Amount is returned as a raw BigInt (no decimal conversion).
   */
  getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint>;

  /**
   * Transfers `amount` (raw, no decimals) of `tokenAddress` to `recipient`.
   * Returns the transaction hash.
   */
  transferToken(tokenAddress: string, recipient: string, amount: bigint): Promise<string>;

  /**
   * Waits for a transaction to be confirmed on-chain.
   * Returns once the tx has at least `confirmations` blocks on top of it.
   */
  waitForConfirmation(txHash: string, confirmations?: number): Promise<void>;
}
