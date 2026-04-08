import { Intent, RouteInfo } from "../types";

// --- Settler Types -----------------------------------------------------------

export enum SettlerType {
  SWAP = "swap",
  INVENTORY = "inventory",
  SOLVER = "solver",
}

// --- Settlement Result -------------------------------------------------------

/**
 * Returned by every settler after a successful settlement.
 * Mirrors the fields IntentService needs to mark an intent COMPLETED
 * and store a meaningful audit trail in intent.metadata.settlement.
 */
export interface SettlementResult {
  /** On-chain tx hash (or comma-separated list for multi-step routes) */
  transactionHash: string;

  /** Actual input amount consumed (may differ from intent.amount due to fees) */
  actualInputAmount: string;

  /** Actual output amount received by the recipient */
  actualOutputAmount: string;

  /** Which settler handled this intent */
  settlerUsed: SettlerType;

  /**
   * The route that was ultimately executed.
   * Settlers that don't use RouteService (e.g. InventorySettler) should
   * still populate this so callers have a consistent shape to work with.
   */
  executedRoute: RouteInfo;

  /** Wall-clock time the settlement took, in milliseconds */
  durationMs: number;
}

// --- Settler Capability Check ------------------------------------------------

/**
 * Returned by canSettle() so the SettlementEngine can log why a settler
 * declined, rather than just getting a boolean false.
 */
export interface SettleabilityCheck {
  capable: boolean;
  /** Human-readable reason when capable is false */
  reason?: string;
}

// --- Core Interface ----------------------------------------------------------

/**
 * Every settlement mechanism implements this interface.
 *
 * Lifecycle per intent:
 *   1. SettlementEngine calls canSettle() on each registered settler in order.
 *   2. The first settler that returns capable=true is asked to settle().
 *   3. settle() is responsible for the full execution and returns a SettlementResult.
 *
 * Settlers must be stateless with respect to individual intents - all
 * intent-specific state lives on the Intent object itself.
 */
export interface ISettler {
  /** Identifies this settler in logs and SettlementResult */
  readonly type: SettlerType;

  /**
   * Checks whether this settler can handle the given intent right now.
   * Must not mutate the intent or trigger any side effects.
   *
   * @param intent - The intent to evaluate
   * @returns SettleabilityCheck with capable flag and optional reason
   */
  canSettle(intent: Intent): Promise<SettleabilityCheck>;

  /**
   * Executes settlement for the given intent.
   * Called only after canSettle() returned capable=true.
   *
   * Implementations are responsible for:
   * - Selecting or building the execution route
   * - Submitting the transaction(s)
   * - Waiting for sufficient confirmation (or returning optimistically)
   * - Returning a complete SettlementResult
   *
   * Throws AppError on failure - the SettlementEngine will propagate it.
   *
   * @param intent - The intent to settle
   * @returns SettlementResult on success
   */
  settle(intent: Intent): Promise<SettlementResult>;
}
