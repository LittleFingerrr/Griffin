import { Router, type Request, type Response } from "express";
import { body, param, validationResult } from "express-validator";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { IntentService } from "../services/IntentService";
import { type CreateIntentRequest, type IntentResponse } from "../types";

const router: Router = Router();
const intentService = new IntentService();

// Validation middleware
const validateCreateIntent = [
  body("fromChain").isInt({ min: 1 }).withMessage("Valid fromChain required"),
  body("toChain").isInt({ min: 1 }).withMessage("Valid toChain required"),
  body("fromToken").isEthereumAddress().withMessage("Valid fromToken address required"),
  body("toToken").isEthereumAddress().withMessage("Valid toToken address required"),
  body("amount").isNumeric().withMessage("Valid amount required"),
  body("recipient").isEthereumAddress().withMessage("Valid recipient address required"),
  body("userAddress").isEthereumAddress().withMessage("Valid userAddress required"),
  body("signature").optional().isString().withMessage("Valid signature required"),
];

const validateIntentId = [param("id").isUUID().withMessage("Valid intent ID required")];

// POST /api/v1/intents - Create new payment intent
router.post(
  "/",
  validateCreateIntent,
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
        errors: errors.array(),
      });
    }

    const intentRequest: CreateIntentRequest = req.body;
    const intent = await intentService.createIntent(intentRequest);

    const response: IntentResponse = {
      intentId: intent.id,
      status: intent.status,
      createdAt: intent.createdAt.toISOString(),
      route: intent.route,
      transactions: intent.transactions,
    };

    res.status(201).json(response);
  }),
);

// GET /api/v1/intents/:id - Get intent status
router.get(
  "/:id",
  validateIntentId,
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
        errors: errors.array(),
      });
    }

    const intentId = req.params.id;
    const intent = await intentService.getIntent(intentId as string);

    if (!intent) {
      throw new AppError("Intent not found", 404, "INTENT_NOT_FOUND");
    }

    const response: IntentResponse = {
      intentId: intent.id,
      status: intent.status,
      createdAt: intent.createdAt.toISOString(),
      estimatedCompletion: intent.completedAt?.toISOString(),
      route: intent.route,
      transactions: intent.transactions,
    };

    res.json(response);
  }),
);

// PUT /api/v1/intents/:id/execute - Execute payment intent
router.put(
  "/:id/execute",
  validateIntentId,
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
        errors: errors.array(),
      });
    }

    const intentId = req.params.id;
    const intent = await intentService.executeIntent(intentId as string);

    const response: IntentResponse = {
      intentId: intent.id,
      status: intent.status,
      createdAt: intent.createdAt.toISOString(),
      route: intent.route,
      transactions: intent.transactions,
    };

    res.json(response);
  }),
);

// DELETE /api/v1/intents/:id - Cancel payment intent
router.delete(
  "/:id",
  validateIntentId,
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
        errors: errors.array(),
      });
    }

    const intentId = req.params.id;
    await intentService.cancelIntent(intentId as string);

    res.status(204).send();
  }),
);

export default router;
