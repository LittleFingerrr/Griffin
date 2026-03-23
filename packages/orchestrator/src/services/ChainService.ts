import { ChainInfo, TokenInfo } from "../types";
import { AppError } from "../middleware/errorHandler";
import { getStellarTokens } from "@/utils/utils";

export class ChainService {
  /* 
    STARKNET ONLY FOR FIRST ITERATION
  */
  private static supportedChains: ChainInfo[] = [
    {
      chainId: "stellar:testnet",
      name: "Stellar",
      symbol: "Stellar",
      rpcUrl: "https://horizon-testnet.stellar.org",
      blockExplorer: "https://stellar.expert/explorer/testnet",
      isTestnet: true
    }
  ];

  private supportedTokens: TokenInfo[]

  constructor () {
    this.supportedTokens = [];

    // TODO: Handle token fetch errors in constructor
    getStellarTokens()
      .then((tokens) => {
        tokens.forEach((token: any) => {
          const equivGriffinToken = {
            address: token.address,
            decimals: token.decimals,
            logoUrl: token.logoUri!,
            // TODO: Fix hardcoded wrong chainId here
            chainId: 'starknet:sepolia', // Change this when deploying to mainnet
            name: token.name,
            symbol: token.symbol
          }

          this.supportedTokens.push(equivGriffinToken);
        })
      })

    // Add more functions when adding new chains
    
  }

  static async getSupportedChains(): Promise<ChainInfo[]> {
    return this.supportedChains;
  }

  async getSupportedTokens(chainId?: string): Promise<TokenInfo[]> {
    if (chainId) {
      const tokens = this.supportedTokens.filter(
        (token) => token.chainId === chainId,
      );
      if (tokens.length === 0) {
        throw new AppError(
          "No tokens found for chain",
          404,
          "NO_TOKENS_FOUND",
          { chainId },
        );
      }
      return tokens;
    }
    return this.supportedTokens;
  }

  static async getChainInfo(chainId: string): Promise<ChainInfo | null> {
    return (
      this.supportedChains.find((chain) => chain.chainId === chainId) || null
    );
  }

  static async isChainSupported(chainId: string): Promise<boolean> {
    return this.supportedChains.some((chain) => chain.chainId === chainId);
  }

  async isTokenSupported(
    tokenAddress: string,
    chainId: string,
  ): Promise<boolean> {
    return this.supportedTokens.some(
      (token) =>
        token.address.toLowerCase() === tokenAddress.toLowerCase() &&
        token.chainId === chainId,
    );
  }

  async getTokenInfo(
    tokenAddress: string,
    chainId: string,
  ): Promise<TokenInfo | null> {
    return (
      this.supportedTokens.find(
        (token) =>
          token.address.toLowerCase() === tokenAddress.toLowerCase() &&
          token.chainId === chainId,
      ) || null
    );
  }
}
