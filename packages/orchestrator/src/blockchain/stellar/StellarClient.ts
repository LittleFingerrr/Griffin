import { type IChainClient } from "../IChainClient";

// TODO: Implement StellarClient using @stellar/stellar-sdk
// It should implement IChainClient with Stellar-native equivalents:
//   - getTokenBalance  → fetch account trustline balance for a given asset
//   - transferToken    → build + sign + submit a Stellar payment operation
//   - waitForConfirmation → poll Horizon for transaction status

export class StellarClient implements IChainClient {
  readonly chainId: string;

  constructor(chainId: string) {
    this.chainId = chainId;
    throw new Error("StellarClient is not yet implemented");
  }

  async getTokenBalance(_tokenAddress: string, _walletAddress: string): Promise<bigint> {
    throw new Error("StellarClient is not yet implemented");
  }

  async transferToken(_tokenAddress: string, _recipient: string, _amount: bigint): Promise<string> {
    throw new Error("StellarClient is not yet implemented");
  }

  async waitForConfirmation(_txHash: string, _confirmations?: number): Promise<void> {
    throw new Error("StellarClient is not yet implemented");
  }
}
