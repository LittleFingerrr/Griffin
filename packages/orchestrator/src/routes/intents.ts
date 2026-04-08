import { Router, type Request, type Response } from "express";
import { body, param, validationResult } from "express-validator";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { type IntentService } from "../services/IntentService";
import { type CreateIntentRequest, type IntentResponse } from "../types";

// Validation middleware
const validateCreateIntent = [
  body("fromChain").isString().notEmpty().withMessage("Valid fromChain required"),
  body("toChain").isString().notEmpty().withMessage("Valid toChain required"),
  body("fromToken").isString().notEmpty().withMessage("Valid fromToken address required"),
  body("toToken").isString().notEmpty().withMessage("Valid toToken address required"),
  body("amount").isNumeric().withMessage("Valid amount required"),
  body("recipient").isString().notEmpty().withMessage("Valid recipient address required"),
  body("userAddress").isString().notEmpty().withMessage("Valid userAddress required"),
  body("signature").optional().isString().withMessage("Valid signature required"),
];

const validateIntentId = [param("id").isUUID().withMessage("Valid intent ID required")];

export default function intentRoutes(intentService: IntentService): Router {
  const router: Router = Router();

  // POST /api/v1/intents
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

  // GET /api/v1/intents/:id
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

      const intent = await intentService.getIntent(req.params.id as string);
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

  // PUT /api/v1/intents/:id/execute
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

      const intent = await intentService.executeIntent(req.params.id as string);

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

  // DELETE /api/v1/intents/:id
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

      await intentService.cancelIntent(req.params.id as string);
      res.status(204).send();
    }),
  );

  return router;
}
