import { Router, type Request, type Response } from "express";
import { body, validationResult } from "express-validator";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { type RouteService } from "../services/RouteService";
import { type QuoteRequest, type QuoteResponse } from "../types";

const validateQuoteRequest = [
  body("fromChain").isString().notEmpty().withMessage("Valid fromChain required"),
  body("toChain").isString().notEmpty().withMessage("Valid toChain required"),
  body("fromToken").isString().notEmpty().withMessage("Valid fromToken address required"),
  body("toToken").isString().notEmpty().withMessage("Valid toToken address required"),
  body("amount").isNumeric().withMessage("Valid amount required"),
  body("slippageTolerance")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("Valid slippage tolerance (0-1) required"),
];

export default function quoteRoutes(routeService: RouteService): Router {
  const router: Router = Router();

  // POST /api/v1/quotes
  router.post(
    "/",
    validateQuoteRequest,
    asyncHandler(async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
          errors: errors.array(),
        });
      }

      const quoteRequest: QuoteRequest = req.body;
      const routes = await routeService.getQuotes(quoteRequest);

      if (routes.length === 0) {
        throw new AppError("No viable routes found", 404, "NO_ROUTES_AVAILABLE", {
          fromChain: quoteRequest.fromChain,
          toChain: quoteRequest.toChain,
          fromToken: quoteRequest.fromToken,
          toToken: quoteRequest.toToken,
        });
      }

      const response: QuoteResponse = {
        routes,
        serviceId: routes[0].serviceId,
        bestRoute: routes[0],
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      res.json(response);
    }),
  );

  return router;
}
