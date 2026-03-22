import { Router, type Request, type Response } from "express";
import { body, validationResult } from "express-validator";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { RouteService } from "../services/RouteService";
import { QuoteRequest, QuoteResponse } from "../types";

const router: Router = Router();
const routeService = new RouteService();

// Validation middleware
const validateQuoteRequest = [
  body("fromChain").isInt({ min: 1 }).withMessage("Valid fromChain required"),
  body("toChain").isInt({ min: 1 }).withMessage("Valid toChain required"),
  body("fromToken")
    .isEthereumAddress()
    .withMessage("Valid fromToken address required"),
  body("toToken")
    .isEthereumAddress()
    .withMessage("Valid toToken address required"),
  body("amount").isNumeric().withMessage("Valid amount required"),
  body("slippageTolerance")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("Valid slippage tolerance (0-1) required"),
];

// POST /api/v1/quotes - Get payment quotes
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
    const routes = await routeService.findBestRoutes(quoteRequest);

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
      bestRoute: routes[0], // Routes are sorted by cost
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    };

    res.json(response);
  }),
);

export default router;
