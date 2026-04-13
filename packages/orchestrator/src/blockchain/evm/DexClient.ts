import { ethers } from "ethers";
import { type IDexClient, type DexQuote } from "../IDexClient";
import { logger } from "../../utils/logger";

// Minimal GriffinDEX ABI — only the functions SwapSettler needs
const GRIFFIN_DEX_ABI = [
  "function getReserves(address tokenA, address tokenB) view returns (uint256 reserveA, uint256 reserveB)",
  "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256)",
  "function swapToRecipient(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient) returns (uint256 amountOut)",
];

export interface DexClientConfig {
  /** The single chain this client is connected to */
  chainId: string;
  rpcUrl: string;
  dexAddress: string;
  /** Private key of Griffin's operator wallet — signs swapToRecipient */
  privateKey: string;
}

/**
 * IDexClient implementation for GriffinDEX on a single EVM chain.
 * Communicates directly with the GriffinDEX smart contract via ethers v6.
 *
 * For multi-chain API-based DEXes (1inch, Paraswap, etc.) implement IDexClient
 * separately — they will accept any chainId per call rather than binding to one.
 */
export class DexClient implements IDexClient {
  readonly name = "griffin-dex";

  private readonly boundChainId: string;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer: ethers.Wallet;
  private readonly dex: ethers.Contract;

  constructor(config: DexClientConfig) {
    this.boundChainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.dex = new ethers.Contract(config.dexAddress, GRIFFIN_DEX_ABI, this.signer);

    logger.info("DexClient initialised", {
      chainId: config.chainId,
      dexAddress: config.dexAddress,
    });
  }

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    chainId: string,
  ): Promise<DexQuote | null> {
    if (chainId !== this.boundChainId) return null;

    let reserveIn: bigint;
    let reserveOut: bigint;

    try {
      [reserveIn, reserveOut] = await this.dex.getReserves(tokenIn, tokenOut);
    } catch {
      return null; // pool doesn't exist
    }

    if (reserveIn === 0n || reserveOut === 0n) {
      return null; // pool exists but has no liquidity
    }

    const amountOut: bigint = await this.dex.getAmountOut(amountIn, reserveIn, reserveOut);

    // Price impact: how much the swap moves the pool price, as a fraction
    const priceImpact = Number(amountIn) / Number(reserveIn);

    return { amountOut, priceImpact };
  }

  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    recipient: string,
    chainId: string,
  ): Promise<string> {
    if (chainId !== this.boundChainId) {
      throw new Error(`DexClient bound to ${this.boundChainId}, got ${chainId}`);
    }

    const tx: ethers.TransactionResponse = await this.dex.swapToRecipient(
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      recipient,
    );

    logger.info("DEX swap submitted", {
      chainId,
      txHash: tx.hash,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      minAmountOut: minAmountOut.toString(),
      recipient,
    });

    return tx.hash;
  }

  async waitForConfirmation(txHash: string, chainId: string): Promise<void> {
    if (chainId !== this.boundChainId) {
      throw new Error(`DexClient bound to ${this.boundChainId}, got ${chainId}`);
    }

    const receipt = await this.provider.waitForTransaction(txHash, 1);

    if (!receipt || receipt.status === 0) {
      throw new Error(`Transaction ${txHash} failed on-chain`);
    }

    logger.info("DEX swap confirmed", { chainId, txHash });
  }
}
