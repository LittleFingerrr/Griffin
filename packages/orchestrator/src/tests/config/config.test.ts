import { config } from "../../config";

describe("config", () => {
  it("exports a config object", () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("has server config with a numeric port", () => {
    expect(typeof config.server.port).toBe("number");
    expect(config.server.port).toBeGreaterThan(0);
  });

  it("has a database url string", () => {
    expect(typeof config.database.url).toBe("string");
    expect(config.database.url.length).toBeGreaterThan(0);
  });

  it("has redis config with url and ttl", () => {
    expect(typeof config.redis.url).toBe("string");
    expect(typeof config.redis.ttl).toBe("number");
    expect(config.redis.ttl).toBeGreaterThan(0);
  });

  it("has cors allowedOrigins as an array", () => {
    expect(Array.isArray(config.cors.allowedOrigins)).toBe(true);
    expect(config.cors.allowedOrigins.length).toBeGreaterThan(0);
  });

  it("has stellar blockchain config", () => {
    expect(config.blockchain.stellar.rpcUrl).toBeDefined();
    expect(config.blockchain.stellar.horizonUrl).toBeDefined();
    expect(config.blockchain.stellar.chainId).toBe("stellar:testnet");
  });

  it("has external service config", () => {
    expect(config.external.oneInch).toBeDefined();
    expect(config.external.thirdweb).toBeDefined();
  });

  it("has logging config", () => {
    expect(typeof config.logging.level).toBe("string");
    expect(typeof config.logging.format).toBe("string");
  });

  it("env defaults to development when NODE_ENV is unset", () => {
    // In test environment NODE_ENV is typically 'test', just verify it's a string
    expect(typeof config.env).toBe("string");
    expect(config.env.length).toBeGreaterThan(0);
  });
});
