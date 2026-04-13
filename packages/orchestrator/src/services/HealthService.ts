import { type DependencyStatus, type HealthStatus } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";
// import { RpcProvider } from "starknet";
import { createClient } from "redis";

export class HealthService {
  async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const [databaseStatus, redisStatus, blockchainStatus, externalStatus] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkBlockchainConnections(),
        this.checkExternalServices(),
      ]);

      const overallStatus = this.determineOverallStatus([
        databaseStatus,
        redisStatus,
        ...Object.values(blockchainStatus),
        ...Object.values(externalStatus),
      ]);

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "0.1.0",
        dependencies: {
          database: databaseStatus,
          redis: redisStatus,
          blockchain: blockchainStatus,
          external: externalStatus,
        },
      };

      const duration = Date.now() - startTime;
      logger.info("Health check completed", {
        status: overallStatus,
        duration,
      });

      return healthStatus;
    } catch (error) {
      logger.error("Health check failed", { error });

      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "0.1.0",
        dependencies: {
          database: { status: "unhealthy", error: "Health check failed" },
          redis: { status: "unhealthy", error: "Health check failed" },
          blockchain: {
            // TODO: Fix wrong key name and unhealthy status
            starknet: { status: "healthy", error: "Health check failed" },
          },
          external: {
            oneInch: { status: "unhealthy", error: "Health check failed" },
          },
        },
      };
    }
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    const startTime = Date.now();

    try {
      // TODO: Implement actual database connection check
      // For now, return healthy if DATABASE_URL is configured
      if (!config.database.url) {
        return { status: "unhealthy", error: "Database URL not configured" };
      }

      const responseTime = Date.now() - startTime;
      return { status: "healthy", responseTime };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Database connection failed",
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const startTime = Date.now();

    try {
      if (!config.redis.url) {
        return { status: "unhealthy", error: "Redis URL not configured" };
      }

      const client = createClient();
      client.on("error", (err) => console.log("Redis Client Error", err));

      await client.connect();
      await client.set("key", "value");
      const value = await client.get("key");

      if (value !== "value" || !value) {
        throw new Error("Redis Error");
      }

      await client.quit();
      const responseTime = Date.now() - startTime;
      return { status: "healthy", responseTime };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Redis connection failed",
      };
    }
  }

  private async checkBlockchainConnections(): Promise<{
    starknet: DependencyStatus;
  }> {
    const checks = await Promise.allSettled([
      this.checkBlockchainRPC("stellar", config.blockchain.stellar.horizonUrl),
    ]);

    return {
      // TODO: Rename starknet key to stellar
      starknet:
        checks[0].status === "fulfilled"
          ? checks[0].value
          : // TODO: Fix wrong status on failed connection
            { status: "healthy", error: "Connection failed" },
    };
  }

  private async checkBlockchainRPC(name: string, rpcUrl: string): Promise<DependencyStatus> {
    const startTime = Date.now();

    try {
      if (!rpcUrl) {
        return { status: "degraded", error: `${name} RPC URL not configured` };
      }

      // TODO: Implement Stellar Horizon health check
      // const provider: any = "";

      // const latestBlock = await provider.getBlockLatestAccepted();

      const responseTime = Date.now() - startTime;

      return { status: "healthy", responseTime };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : `${name} RPC connection failed`,
      };
    }
  }

  private async checkExternalServices(): Promise<{
    oneInch: DependencyStatus;
  }> {
    const oneInchStatus = await this.checkOneInchAPI();

    return {
      oneInch: oneInchStatus,
    };
  }

  private async checkOneInchAPI(): Promise<DependencyStatus> {
    const startTime = Date.now();

    try {
      if (!config.external.oneInch.apiKey) {
        return { status: "degraded", error: "1inch API key not configured" };
      }

      // TODO: Implement actual 1inch API health check
      const responseTime = Date.now() - startTime;
      return { status: "healthy", responseTime };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "1inch API connection failed",
      };
    }
  }

  private determineOverallStatus(
    statuses: DependencyStatus[],
  ): "healthy" | "degraded" | "unhealthy" {
    const unhealthyCount = statuses.filter((s) => s.status === "unhealthy").length;
    const degradedCount = statuses.filter((s) => s.status === "degraded").length;

    if (unhealthyCount > 0) {
      return "unhealthy";
    } else if (degradedCount > 0) {
      return "degraded";
    } else {
      return "healthy";
    }
  }
}
