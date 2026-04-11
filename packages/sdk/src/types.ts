// ---------------------------------------------------------------------------
// Shared domain types for the Griffin SDK.
// These mirror the orchestrator's public API shapes — keep them in sync when
// the orchestrator API changes.
// ---------------------------------------------------------------------------

export type ChainId = string; // e.g. "eip155:133" (Hashkey), "stellar:testnet"

export interface CreateIntentRequest {
  fromChain: ChainId;
  toChain: ChainId;
  fromToken: string;
  toToken: string;
  amount: string;
  recipient: string;
  userAddress: string;
  requestMessage: string | Record<string, unknown>;
  requestSignature?: string;
}

export type IntentStatus =
  | "pending"
  | "verified"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface IntentResponse {
  intentId: string;
  status: IntentStatus;
  createdAt: string;
  estimatedCompletion?: string;
}

export interface QuoteRequest {
  fromChain: ChainId;
  toChain: ChainId;
  fromToken: string;
  toToken: string;
  amount: string;
  slippageTolerance?: number;
}

export interface RouteStep {
  type: "swap" | "bridge";
  provider: string;
  fromChain: ChainId;
  toChain: ChainId;
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedOutput: string;
}

export interface RouteInfo {
  id: string;
  steps: RouteStep[];
  totalCost: string;
  estimatedTime: number;
  slippageTolerance: number;
}

export interface QuoteResponse {
  routes: RouteInfo[];
  bestRoute?: RouteInfo;
  timestamp: string;
  expiresAt: string;
}

export interface ChainInfo {
  chainId: ChainId;
  name: string;
  symbol: string;
  blockExplorer: string;
  isTestnet: boolean;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
}

export interface GriffinError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
