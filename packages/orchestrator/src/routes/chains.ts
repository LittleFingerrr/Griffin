import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { ChainService } from "../services/ChainService";
import { GriffinSupportedTokens } from "@/utils/utils";

const router: Router = Router();
const supportedTokens = GriffinSupportedTokens;
const chainService = new ChainService(supportedTokens);

// GET /api/v1/chains - Get supported chains
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const chains = await ChainService.getSupportedChains();
    res.json({ chains });
  }),
);

// GET /api/v1/chains/:chainId/tokens - Get supported tokens for a chain
router.get(
  "/:chainId/tokens",
  asyncHandler(async (req: Request, res: Response) => {
    const chainId = req.params.chainId;
    // const chainId = parseInt(rawChainId as string, 10); => Chain id is string now
    const tokens = await chainService.getSupportedTokens(chainId as string);
    res.json({ tokens });
  }),
);

export default router;
