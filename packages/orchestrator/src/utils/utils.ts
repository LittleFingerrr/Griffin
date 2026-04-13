import { config } from "@/config";
import { type IntentMessageType, type SignatureType, type QuoteRequest } from "@/types";
import { Keypair, StrKey, rpc } from "@stellar/stellar-sdk";
import { isAddress } from "ethers";

const validateStellarAddress = (address: string): boolean => {
  return StrKey.isValidEd25519PublicKey(address);
};

export const validateAddress = (chainId: string, address: string): boolean => {
  if (chainId.startsWith("stellar")) {
    return validateStellarAddress(address);
  } else if (chainId.startsWith("eip155")) {
    // EVMs would be: if chainId.startsWith(eip155);
    console.log("Checking evm address");
    return isAddress(address);
  }

  return false;
};

const validateStellarSignature = async (
  signature: Buffer,
  message: Buffer,
  userAddress: string,
): Promise<boolean> => {
  try {
    const keypair = Keypair.fromPublicKey(userAddress);
    return keypair.verify(message, signature);
  } catch {
    return false;
  }
};

export const validateSignature = async (
  chainId: string,
  signature: SignatureType,
  message: IntentMessageType,
  userAddress: string,
): Promise<boolean> => {
  if (chainId.startsWith("stellar")) {
    return await validateStellarSignature(signature as Buffer, message as Buffer, userAddress);
  }

  return false;
};

// TODO: Implement Stellar token fetching (e.g. from Stellar Asset List or Soroban token registry)
export const getStellarTokens = async (): Promise<unknown[]> => {
  throw new Error("Stellar token fetching not yet implemented");
};

// TODO: Implement Stellar quote fetching (e.g. Stellar DEX path payment or Soroban AMM)
export const getTokenQuotes = async (_request: QuoteRequest): Promise<unknown[]> => {
  throw new Error("Stellar quote fetching not yet implemented");
};

// TODO: Implement Stellar swap execution using Soroban / Stellar DEX path payments
export const executeStellarSwap = async (): Promise<string> => {
  const { accountAddress, secretKey, rpcUrl } = config.blockchain.stellar;

  if (!accountAddress || !secretKey || !rpcUrl) {
    throw new Error("Env variables not configured");
  }

  const server = new rpc.Server(rpcUrl);
  const keypair = Keypair.fromSecret(secretKey);

  // Griffin account used to execute swaps after payment confirmation
  const account = await server.getAccount(accountAddress);

  void keypair;
  void account;

  throw new Error("Stellar swap not yet implemented");
};

// ---------------------------------------------------------------------------//
// -----------------------------DATA------------------------------------------//
// ---------------------------------------------------------------------------//

/// To support a chain, just add the chain details to this array;

export const GriffinSupportedChains = [
  {
    chainId: "eip155:133",
    name: "Hashkey Testnet",
    symbol: "HSK",
    rpcUrl: "https://testnet.hsk.xyz",
    blockExplorer: "https://testnet-explorer.hsk.xyz",
    isTestnet: true,
  },
];

/// To support a token, just add the token details to this array;

export const GriffinSupportedTokens = [
  {
    address: "0xb8F355f10569FD2A765296161d082Cc37c5843c2",
    symbol: "tHSK",
    name: "Test HSK",
    decimals: 18,
    chainId: "eip155:133",
  },
  {
    address: "0xc4C2841367016C9e2652Fecc49bBA9229787bA82",
    symbol: "tUSDC",
    name: "Test USDC",
    decimals: 6,
    chainId: "eip155:133",
  },
];
