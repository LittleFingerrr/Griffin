import express, { Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { RouteService } from "./services/RouteService";
import { IntentService } from "./services/IntentService";
import { HealthService } from "./services/HealthService";
import { SettlementEngine } from "./settlement/SettlementEngine";
import { InventorySettler } from "./settlement/InventorySettler";
import { SwapSettler } from "./settlement/SwapSettler";
import { EvmClient } from "./blockchain/evm/EvmClient";
import { DexClient } from "./blockchain/evm/DexClient";
import { type IChainClient } from "./blockchain/IChainClient";
import { type IDexClient } from "./blockchain/IDexClient";

// Import routes
import intentRoutes from "./routes/intents";
import quoteRoutes from "./routes/quotes";
import healthRoutes from "./routes/health";
import chainRoutes from "./routes/chains";

// --- Composition root --------------------------------------------------------
// Wire settlers here. Order = preference (first capable settler wins).
// Add new settlers by importing and appending to the array — nothing else changes.

// Chain clients — one per supported chain
const chainClients = new Map<string, IChainClient>();

if (config.blockchain.hashkey.operatorPrivateKey) {
  chainClients.set(
    config.blockchain.hashkey.chainId,
    new EvmClient({
      chainId: config.blockchain.hashkey.chainId,
      rpcUrl: config.blockchain.hashkey.rpcUrl,
      privateKey: config.blockchain.hashkey.operatorPrivateKey,
    }),
  );
} else {
  logger.warn("GRIFFIN_OPERATOR_PRIVATE_KEY not set — InventorySettler will decline all intents");
}

// DEX clients — one per supported chain
const dexClients = new Map<string, IDexClient>();

if (config.blockchain.hashkey.operatorPrivateKey && config.blockchain.hashkey.dexAddress) {
  dexClients.set(
    config.blockchain.hashkey.chainId,
    new DexClient({
      chainId: config.blockchain.hashkey.chainId,
      rpcUrl: config.blockchain.hashkey.rpcUrl,
      dexAddress: config.blockchain.hashkey.dexAddress,
      privateKey: config.blockchain.hashkey.operatorPrivateKey,
    }),
  );
} else {
  logger.warn("GRIFFIN_DEX_ADDRESS not set — SwapSettler will decline all intents");
}

const routeService = new RouteService();
const settlementEngine = new SettlementEngine([
  new InventorySettler(chainClients, config.blockchain.hashkey.vaultAddress),
  new SwapSettler(dexClients, chainClients),
]);
const intentService = new IntentService(settlementEngine);
// -----------------------------------------------------------------------------

const app: Express = express();

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "responding"
  })
})

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// API routes
app.use("/api/v1/intents", intentRoutes(intentService));
app.use("/api/v1/quotes", quoteRoutes(routeService));
app.use("/api/v1/health", healthRoutes(new HealthService()));
app.use("/api/v1/chains", chainRoutes);

// 404 handler
app.use("/{*path}", (req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
      timestamp: new Date().toISOString(),
    },
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = config.server.port || 3000;

// Only start listening when this file is run directly, not when imported in tests
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Griffin Orchestrator server running on port ${PORT}`);
    logger.info(`Environment: ${config.env}`);
  });
}

export default app;
