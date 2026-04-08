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

// Import routes
import intentRoutes from "./routes/intents";
import quoteRoutes from "./routes/quotes";
import healthRoutes from "./routes/health";
import chainRoutes from "./routes/chains";

// --- Composition root --------------------------------------------------------
// Wire settlers here. Order = preference (first capable settler wins).
// Add new settlers by importing and appending to the array — nothing else changes.
const routeService = new RouteService();
const settlementEngine = new SettlementEngine([
  // new InventorySettler(),   <- add when implemented
  // new SwapSettler(routeService),  <- add when implemented
]);
const intentService = new IntentService(settlementEngine);
// -----------------------------------------------------------------------------

const app: Express = express();

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
app.use("*", (req: Request, res: Response) => {
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
