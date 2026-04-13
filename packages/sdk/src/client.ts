import type {
  CreateIntentRequest,
  IntentResponse,
  QuoteRequest,
  QuoteResponse,
  ChainInfo,
  HealthResponse,
  GriffinError,
} from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GriffinClientConfig {
  /** Base URL of the Griffin orchestrator, e.g. "https://api.griffin.xyz" */
  baseUrl: string;
  /** Optional API key — sent as Authorization: Bearer <apiKey> */
  apiKey?: string;
  /** Request timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GriffinApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, error: GriffinError) {
    super(error.message);
    this.name = "GriffinApiError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GriffinClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: GriffinClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // strip trailing slash
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Intents
  // -------------------------------------------------------------------------

  /** Submit a new cross-chain payment intent. */
  async createIntent(request: CreateIntentRequest): Promise<IntentResponse> {
    return this.post<IntentResponse>("/api/v1/intents", request);
  }

  /** Fetch the current state of an intent by ID. */
  async getIntent(intentId: string): Promise<IntentResponse> {
    return this.get<IntentResponse>(`/api/v1/intents/${intentId}`);
  }

  /** Trigger execution of a verified intent. */
  async executeIntent(intentId: string): Promise<IntentResponse> {
    return this.put<IntentResponse>(`/api/v1/intents/${intentId}/execute`);
  }

  /** Cancel a pending intent. */
  async cancelIntent(intentId: string): Promise<void> {
    return this.delete(`/api/v1/intents/${intentId}`);
  }

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------

  /** Get available routes and cost estimates for a potential swap. */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    return this.post<QuoteResponse>("/api/v1/quotes", request);
  }

  // -------------------------------------------------------------------------
  // Chains
  // -------------------------------------------------------------------------

  /** List all chains supported by this Griffin instance. */
  async getSupportedChains(): Promise<ChainInfo[]> {
    return this.get<ChainInfo[]>("/api/v1/chains");
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /** Check orchestrator health. Useful for readiness probes. */
  async getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>("/api/v1/health");
  }

  // -------------------------------------------------------------------------
  // Internal fetch helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async delete(path: string): Promise<void> {
    return this.request<void>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(
        `Griffin request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const payload: any = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText, timestamp: new Date().toISOString() },
      }));
      throw new GriffinApiError(response.status, payload.error ?? payload);
    }

    // 204 No Content — nothing to parse
    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  }
}
