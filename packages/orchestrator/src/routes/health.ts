import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { HealthService } from "../services/HealthService";

export default function healthRoutes(healthService: HealthService): Router {
  const router: Router = Router();

  // GET /api/v1/health
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      const healthStatus = await healthService.getHealthStatus();
      const statusCode = healthStatus.status === "healthy" ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    }),
  );

  return router;
}
