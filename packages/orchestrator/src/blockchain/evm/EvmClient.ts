import { ethers } from "ethers";
import { type IChainClient } from "../IChainClient";
import { logger } from "@/utils/logger";

// Minimal ERC-20 ABI — only the functions we actually call
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export interface EvmClientConfig {
  chainId: string;
  rpcUrl: string;
  /** Private key of Griffin's operator wallet */
  privateKey: string;
}

export class EvmClient implements IChainClient {
  readonly chainId: string;

  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer: ethers.Wallet;

  constructor(config: EvmClientConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    logger.info("EvmClient initialised", { chainId: config.chainId, rpcUrl: config.rpcUrl });
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance: bigint = await contract.balanceOf(walletAddress);
    return balance;
  }

  async transferToken(tokenAddress: string, recipient: string, amount: bigint): Promise<string> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    const tx: ethers.TransactionResponse = await contract.transfer(recipient, amount);

    logger.info("EVM transfer submitted", {
      chainId: this.chainId,
      txHash: tx.hash,
      recipient,
      amount: amount.toString(),
    });

    return tx.hash;
  }

  async waitForConfirmation(txHash: string, confirmations = 1): Promise<void> {
    const receipt = await this.provider.waitForTransaction(txHash, confirmations);

    if (!receipt || receipt.status === 0) {
      throw new Error(`Transaction ${txHash} failed on-chain`);
    }

    logger.info("EVM transaction confirmed", { chainId: this.chainId, txHash, confirmations });
  }
}
