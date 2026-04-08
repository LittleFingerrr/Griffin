import { Intent } from "../types";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { ISettler, SettlementResult, SettlerType } from "./ISettler";

/**
 * Selects and delegates to the appropriate settler for a given intent.
 *
 * Settlers are evaluated in the order they are registered. The first one
 * that returns capable=true handles the intent. Order is your preference
 * ranking - put faster/cheaper settlers first (e.g. inventory before swap).
 *
 * Wire this up once at startup and inject it into IntentService.
 */
export class SettlementEngine {
  private readonly settlers: ISettler[];

  constructor(settlers: ISettler[]) {
    this.settlers = settlers;

    logger.info("SettlementEngine initialised", {
      settlers: settlers.map((s) => s.type),
    });
  }

  /**
   * Finds the first capable settler and executes settlement.
   * Throws AppError with NO_SETTLER if none can handle the intent.
   */
  async settle(intent: Intent): Promise<SettlementResult> {
    const declines: Array<{ type: SettlerType; reason: string }> = [];

    for (const settler of this.settlers) {
      const check = await settler.canSettle(intent);

      if (!check.capable) {
        declines.push({
          type: settler.type,
          reason: check.reason ?? "declined",
        });
        logger.debug("Settler declined intent", {
          settler: settler.type,
          intentId: intent.id,
          reason: check.reason,
        });
        continue;
      }

      logger.info("Settler selected", {
        settler: settler.type,
        intentId: intent.id,
      });

      return settler.settle(intent);
    }

    // All settlers declined - surface the reasons so the caller can act on them
    logger.error("No settler available for intent", {
      intentId: intent.id,
      declines,
    });

    throw new AppError(
      "No settler available for this intent",
      500,
      "NO_SETTLER",
      { declines },
    );
  }

  /** Returns the ordered list of registered settler types - useful for health checks. */
  getRegisteredSettlers(): SettlerType[] {
    return this.settlers.map((s) => s.type);
  }
}
