import { type IBridgeClient, type BridgeRoute, type BridgeStep, type BridgeStepTransaction } from "../IBridgeClient";
import { logger } from "../../utils/logger";

const BASE_URL = "https://api.superbridge.app";

// ---------------------------------------------------------------------------
// Superbridge API response shapes (subset we actually use)
// ---------------------------------------------------------------------------

interface SbEvmTx {
  to: string;
  data: string;
  value: string;
  gas?: string;
}

interface SbRouteQuote {
  id: string;
  provider: { name: string };
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  estimatedReceived: string;
  estimatedTimeSeconds: number;
  fees: { totalUsd: string };
  initiatingTransaction: SbEvmTx;
  tokenApproval?: { tx: SbEvmTx };
  revokeTokenApproval?: { tx: SbEvmTx };
}

interface SbRouteResult {
  result: SbRouteQuote | { error: string };
}

interface SbRoutesResponse {
  results: SbRouteResult[];
}

interface SbStepTxResponse {
  to: string;
  data: string;
  value: string;
  gas?: string;
}

interface SbActivityStep {
  action?: string;
  confirmation?: { transactionHash: string };
  status?: string;
}

interface SbActivity {
  id: string;
  provider: { name: string };
  nextCheckTimestamp?: number;
  steps: SbActivityStep[];
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRouteQuote(r: SbRouteQuote | { error: string }): r is SbRouteQuote {
  return !("error" in r);
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface SuperbridgeClientConfig {
  apiKey: string;
  /** Griffin's operator wallet address — used as sender in route requests */
  senderAddress: string;
}

/**
 * IBridgeClient implementation backed by the Superbridge HTTP API.
 *
 * The Superbridge SDK (@superbridge/sdk) is not yet publicly available on npm,
 * so we call the REST API directly using fetch. The implementation mirrors the
 * official SDK examples exactly — when the SDK ships, this can be swapped in
 * with minimal changes.
 *
 * Docs: https://docs.superbridge.app/api-reference
 */
export class SuperbridgeClient implements IBridgeClient {
  readonly name = "superbridge";

  private readonly apiKey: string;
  private readonly senderAddress: string;

  // In-memory cache: routeId → SbRouteQuote, so getStepTransaction can look it up
  private readonly routeCache = new Map<string, SbRouteQuote>();

  constructor(config: SuperbridgeClientConfig) {
    this.apiKey = config.apiKey;
    this.senderAddress = config.senderAddress;

    logger.info("SuperbridgeClient initialised", { sender: config.senderAddress });
  }

  // -------------------------------------------------------------------------
  // getRoutes
  // -------------------------------------------------------------------------

  async getRoutes(
    fromChain: string,
    toChain: string,
    fromToken: string,
    toToken: string,
    amount: string,
  ): Promise<BridgeRoute[]> {
    const fromChainId = this.chainIdToNumeric(fromChain);
    const toChainId   = this.chainIdToNumeric(toChain);

    const body = {
      fromChainId,
      toChainId,
      fromTokenAddress: fromToken,
      toTokenAddress:   toToken,
      amount,
      sender:    this.senderAddress,
      recipient: this.senderAddress, // overridden per-intent in getStepTransaction
    };

    const data = await this.post<SbRoutesResponse>("/v1/routes", body);

    const routes: BridgeRoute[] = [];

    for (const result of data.results) {
      if (!isRouteQuote(result.result)) continue;

      const q = result.result;
      this.routeCache.set(q.id, q);

      const steps: BridgeStep[] = [];
      let stepIndex = 0;

      if (q.revokeTokenApproval) {
        steps.push({ index: stepIndex++, description: "Revoke existing token allowance", chainId: fromChain, requiresApproval: false });
      }
      if (q.tokenApproval) {
        steps.push({ index: stepIndex++, description: "Approve token for bridge", chainId: fromChain, requiresApproval: true });
      }
      steps.push({ index: stepIndex, description: `Bridge via ${q.provider.name}`, chainId: fromChain, requiresApproval: false });

      routes.push({
        routeId:              q.id,
        provider:             q.provider.name,
        fromChain,
        toChain,
        fromToken,
        toToken,
        amountIn:             q.amount,
        amountOut:            q.estimatedReceived,
        estimatedTimeSeconds: q.estimatedTimeSeconds,
        feesUsd:              q.fees.totalUsd,
        steps,
      });
    }

    logger.info("SuperbridgeClient routes fetched", {
      fromChain, toChain, count: routes.length,
    });

    return routes;
  }

  // -------------------------------------------------------------------------
  // getStepTransaction
  // -------------------------------------------------------------------------

  async getStepTransaction(
    routeId: string,
    stepIndex: number,
    sender: string,
    recipient: string,
  ): Promise<BridgeStepTransaction> {
    const quote = this.routeCache.get(routeId);
    if (!quote) {
      throw new Error(`Route ${routeId} not found in cache — call getRoutes first`);
    }

    const steps = this.buildStepList(quote);
    const step  = steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} does not exist for route ${routeId}`);
    }

    let tx: SbEvmTx;

    if (step.type === "revokeApproval") {
      tx = quote.revokeTokenApproval!.tx;
    } else if (step.type === "approval") {
      tx = quote.tokenApproval!.tx;
    } else {
      // Initiating bridge transaction — fetch fresh calldata with correct recipient
      const data = await this.post<SbStepTxResponse>("/v1/get_step_transaction", {
        id:        quote.id,
        action:    "initiate",
        provider:  quote.provider.name,
        submitter: sender,
        recipient,
      });
      tx = data;
    }

    return {
      chainId:  this.numericToChainId(quote.fromChainId),
      to:       tx.to,
      data:     tx.data,
      value:    tx.value,
      gasLimit: tx.gas,
    };
  }

  // -------------------------------------------------------------------------
  // waitForCompletion
  // -------------------------------------------------------------------------

  async waitForCompletion(txHash: string, fromChain: string, toChain: string): Promise<void> {
    logger.info("SuperbridgeClient waiting for bridge completion", { txHash, fromChain, toChain });

    const MAX_POLLS = 60;
    const BASE_DELAY_MS = 10_000;

    for (let i = 0; i < MAX_POLLS; i++) {
      const activities = await this.get<SbActivity[]>(
        `/v1/activity?evmAddress=${this.senderAddress}`,
      );

      const bridge = activities.find((a) =>
        a.steps.some((s) => s.confirmation?.transactionHash === txHash),
      );

      if (bridge) {
        const allDone = bridge.steps.every(
          (s) => s.status === "done" || s.status === "auto" || s.status === "info",
        );

        if (allDone) {
          logger.info("SuperbridgeClient bridge complete", { txHash });
          return;
        }

        const delay = bridge.nextCheckTimestamp
          ? Math.max(bridge.nextCheckTimestamp - Date.now(), 2_000)
          : BASE_DELAY_MS;

        await sleep(delay);
      } else {
        await sleep(BASE_DELAY_MS);
      }
    }

    throw new Error(`Bridge did not complete within polling window for tx ${txHash}`);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildStepList(quote: SbRouteQuote): Array<{ type: "revokeApproval" | "approval" | "bridge" }> {
    const steps: Array<{ type: "revokeApproval" | "approval" | "bridge" }> = [];
    if (quote.revokeTokenApproval) steps.push({ type: "revokeApproval" });
    if (quote.tokenApproval)       steps.push({ type: "approval" });
    steps.push({ type: "bridge" });
    return steps;
  }

  /** Converts "eip155:133" → 133 */
  private chainIdToNumeric(chainId: string): number {
    const parts = chainId.split(":");
    const numeric = parseInt(parts[parts.length - 1], 10);
    if (isNaN(numeric)) throw new Error(`Cannot parse numeric chain ID from "${chainId}"`);
    return numeric;
  }

  /** Converts 133 → "eip155:133" */
  private numericToChainId(numeric: number): string {
    return `eip155:${numeric}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Superbridge API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "x-api-key": this.apiKey },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Superbridge API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
