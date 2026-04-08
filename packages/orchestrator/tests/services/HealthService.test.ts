import { HealthService } from "../../src/services/HealthService";

// Mock redis to avoid real connection attempts
jest.mock("redis", () => ({
  createClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue("value"),
    quit: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe("HealthService.getHealthStatus", () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it("returns a HealthStatus object", async () => {
    const status = await service.getHealthStatus();
    expect(status).toBeDefined();
    expect(status.status).toMatch(/^(healthy|degraded|unhealthy)$/);
  });

  it("includes a valid ISO timestamp", async () => {
    const status = await service.getHealthStatus();
    expect(new Date(status.timestamp).getTime()).not.toBeNaN();
  });

  it("includes a version string", async () => {
    const status = await service.getHealthStatus();
    expect(typeof status.version).toBe("string");
    expect(status.version.length).toBeGreaterThan(0);
  });

  it("includes all required dependency keys", async () => {
    const status = await service.getHealthStatus();
    expect(status.dependencies.database).toBeDefined();
    expect(status.dependencies.redis).toBeDefined();
    expect(status.dependencies.blockchain).toBeDefined();
    expect(status.dependencies.external).toBeDefined();
  });

  it("each dependency status is healthy | degraded | unhealthy", async () => {
    const status = await service.getHealthStatus();
    const validStatuses = ["healthy", "degraded", "unhealthy"];

    expect(validStatuses).toContain(status.dependencies.database.status);
    expect(validStatuses).toContain(status.dependencies.redis.status);
    expect(validStatuses).toContain(status.dependencies.blockchain.starknet.status);
    expect(validStatuses).toContain(status.dependencies.external.oneInch.status);
  });

  it("returns unhealthy overall when redis fails", async () => {
    const { createClient } = require("redis");
    createClient.mockReturnValueOnce({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error("connection refused")),
      set: jest.fn(),
      get: jest.fn(),
      quit: jest.fn(),
    });

    const status = await service.getHealthStatus();
    expect(status.dependencies.redis.status).toBe("unhealthy");
  });

  it("overall status is unhealthy when any dependency is unhealthy", async () => {
    // Force redis to fail so we get at least one unhealthy dep
    const { createClient } = require("redis");
    createClient.mockReturnValueOnce({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error("down")),
      set: jest.fn(),
      get: jest.fn(),
      quit: jest.fn(),
    });

    const status = await service.getHealthStatus();
    expect(status.status).toBe("unhealthy");
  });
});
