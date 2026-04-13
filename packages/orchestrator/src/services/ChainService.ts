import { type ChainInfo, type TokenInfo } from "../types";
import { AppError } from "../middleware/errorHandler";
import { GriffinSupportedChains } from "../utils/utils";

export class ChainService {
  /* 
    HASHKEY ONLY FOR FIRST ITERATION
    TODO: Add configuration for user to actually add their token, 
    with what you need, and check availability on a suitable swap, stuff like that
  */
  private static supportedChains: ChainInfo[] = GriffinSupportedChains;

  // I think this should be static
  private supportedTokens: TokenInfo[];

  constructor(supportedTokens: TokenInfo[]) {
    // Dynamically add tokens when you can load tokens,
    // but from the outside party calling this constructor, not here
    this.supportedTokens = supportedTokens;
  }

  static async getSupportedChains(): Promise<ChainInfo[]> {
    return this.supportedChains;
  }

  async getSupportedTokens(chainId?: string): Promise<TokenInfo[]> {
    if (chainId) {
      const tokens = this.supportedTokens.filter((token) => token.chainId === chainId);
      if (tokens.length === 0) {
        throw new AppError("No tokens found for chain", 404, "NO_TOKENS_FOUND", { chainId });
      }
      return tokens;
    }
    return this.supportedTokens;
  }

  static async getChainInfo(chainId: string): Promise<ChainInfo | null> {
    return this.supportedChains.find((chain) => chain.chainId === chainId) || null;
  }

  static async isChainSupported(chainId: string): Promise<boolean> {
    return this.supportedChains.some((chain) => chain.chainId === chainId);
  }

  async isTokenSupported(tokenAddress: string, chainId: string): Promise<boolean> {
    return this.supportedTokens.some(
      (token) =>
        token.address.toLowerCase() === tokenAddress.toLowerCase() && token.chainId === chainId,
    );
  }

  async getTokenInfo(tokenAddress: string, chainId: string): Promise<TokenInfo | null> {
    return (
      this.supportedTokens.find(
        (token) =>
          token.address.toLowerCase() === tokenAddress.toLowerCase() && token.chainId === chainId,
      ) || null
    );
  }
}
