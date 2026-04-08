import dotenv from "dotenv";

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || "development",

  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "localhost",
  },

  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://localhost:5432/griffin_orchestrator",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    ttl: parseInt(process.env.REDIS_TTL || "300", 10), // 5 minutes default
  },

  cors: {
    allowedOrigins: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
  },

  blockchain: {
    // Change to the chains we are supporting
    // ethereum: {
    //   rpcUrl: process.env.ETHEREUM_RPC_URL || '',
    //   chainId: 1
    // },
    // polygon: {
    //   rpcUrl: process.env.POLYGON_RPC_URL || '',
    //   chainId: 137
    // },
    // arbitrum: {
    //   rpcUrl: process.env.ARBITRUM_RPC_URL || '',
    //   chainId: 42161
    // },
    // optimism: {
    //   rpcUrl: process.env.OPTIMISM_RPC_URL || '',
    //   chainId: 10
    // },
    stellar: {
      rpcUrl:
        process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
      horizonUrl:
        process.env.STELLAR_HORIZON_URL ||
        "https://horizon-testnet.stellar.org",
      chainId: "stellar:testnet",
      accountAddress: process.env.GRIFFIN_STELLAR_ACCOUNT_ADDRESS,
      secretKey: process.env.GRIFFIN_STELLAR_SECRET_KEY,
    },
  },

  external: {
    oneInch: {
      apiKey: process.env.ONEINCH_API_KEY || "",
      baseUrl: "https://api.1inch.dev",
    },
    thirdweb: {
      clientId: process.env.THIRDWEB_CLIENT_ID || "",
      secretKey: process.env.THIRDWEB_SECRET_KEY || "",
    },
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || "your-secret-key",
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || "900000", 10), // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
  },
};
