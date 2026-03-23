
export interface Intent {
  id: string;
  userAddress: string;
  fromChain: ChainInfo['chainId'];
  toChain: ChainInfo['chainId'];
  fromToken: string;
  toToken: string;
  amount: string;
  recipient: string;
  status: IntentStatus;
  route?: RouteInfo;
  transactions: TransactionInfo[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata: Record<string, any>;
}

export enum IntentStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  EXECUTING = "executing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface RouteInfo {
  id: string;
  serviceId: string;
  steps: RouteStep[];
  totalCost: string;
  estimatedTime: number;
  slippageTolerance: number;
  gasEstimate: GasEstimate;
  createdAt: Date;
  expiresAt: Date;
}

export interface RouteStep {
  type: "swap" | "bridge";
  provider: string;
  fromChain: ChainInfo['chainId'];
  toChain: ChainInfo['chainId'];
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedOutput: string;
  fees: FeeInfo;
}

export interface TransactionInfo {
  id: string;
  intentId: string;
  chainId: ChainInfo['chainId'];
  hash?: string;
  status: TransactionStatus;
  type: "swap" | "bridge" | "approval";
  gasUsed?: string;
  gasPrice?: string;
  blockNumber?: number;
  confirmations: number;
  createdAt: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  failureReason?: string;
}

export enum TransactionStatus {
  PENDING = "pending",
  SUBMITTED = "submitted",
  CONFIRMED = "confirmed",
  FAILED = "failed",
}

export interface GasEstimate {
  // gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  serviceCost: string,
  totalCost: string;
}

export interface FeeInfo {
  bridgeFee?: string;
  gasFee: string;
  protocolFee?: string;
  slippageFee?: string;
  total: string;
}

export type SignatureType = Buffer | string;

export type IntentMessageType = Buffer | string | Record<string, unknown>;

export interface CreateIntentRequest {
  fromChain: ChainInfo['chainId'];
  toChain: ChainInfo['chainId'];
  fromToken: string;
  toToken: string;
  amount: string;
  recipient: string;
  userAddress: string;
  requestSignature?: SignatureType;
  requestMessage: IntentMessageType;
}

export interface IntentResponse {
  intentId: string;
  status: IntentStatus;
  createdAt: string;
  estimatedCompletion?: string;
  route?: RouteInfo;
  transactions?: TransactionInfo[];
}

export interface QuoteRequest {
  fromChain: ChainInfo['chainId'];
  toChain: ChainInfo['chainId'];
  fromToken: string;
  toToken: string;
  amount: string;
  slippageTolerance?: number;
}

export interface QuoteResponse {
  serviceId: string,
  routes: RouteInfo[];
  bestRoute?: RouteInfo;
  timestamp: string;
  expiresAt: string;
}

// Construct a union type from the above sha

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
  };
}

export type ChainInfo = {
  chainId: string; // {namespace}:{chainid} Evm: eip155:97 -> bsc testnet, Starknet: starknet:mainnet
  name: string;
  symbol: string;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
  // supportedTokens: string[];
  // getSupportedTokens: (chainId: ChainInfo['chainId']) => Promise<TokenInfo[]>
};

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: ChainInfo["chainId"];
  logoUrl?: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    // TODO: Update blockchain health key to stellar
    blockchain: {
      starknet: DependencyStatus;
    };
    external: {
      oneInch: DependencyStatus;
    };
  };
}

export interface DependencyStatus {
  status: "healthy" | "degraded" | "unhealthy";
  responseTime?: number;
  error?: string;
}
