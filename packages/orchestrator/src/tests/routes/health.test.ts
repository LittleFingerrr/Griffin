import request from "supertest";
import express from "express";
import healthRoutes from "../../routes/health";
import { errorHandler } from "../../middleware/errorHandler";
import { HealthService } from "../../services/HealthService";

const mockGetHealthStatus = jest.fn();
const mockHealthService = { getHealthStatus: mockGetHealthStatus } as unknown as HealthService;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/health", healthRoutes(mockHealthService));
  app.use(errorHandler);
  return app;
};

describe("GET /api/v1/health", () => {
  it("returns 200 when status is healthy", async () => {
    mockGetHealthStatus.mockResolvedValue({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      dependencies: {
        database: { status: "healthy" },
        redis: { status: "healthy" },
        blockchain: { starknet: { status: "healthy" } },
        external: { oneInch: { status: "healthy" } },
      },
    });

    const res = await request(buildApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  it("returns 503 when status is unhealthy", async () => {
    mockGetHealthStatus.mockResolvedValue({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      dependencies: {
        database: { status: "unhealthy" },
        redis: { status: "unhealthy" },
        blockchain: { starknet: { status: "unhealthy" } },
        external: { oneInch: { status: "unhealthy" } },
      },
    });

    const res = await request(buildApp()).get("/api/v1/health");
    expect(res.status).toBe(503);
  });

  it("returns 503 when status is degraded", async () => {
    mockGetHealthStatus.mockResolvedValue({
      status: "degraded",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      dependencies: {
        database: { status: "healthy" },
        redis: { status: "degraded" },
        blockchain: { starknet: { status: "healthy" } },
        external: { oneInch: { status: "healthy" } },
      },
    });

    const res = await request(buildApp()).get("/api/v1/health");
    expect(res.status).toBe(503);
  });
});
