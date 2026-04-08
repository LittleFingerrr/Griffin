import {
  type RouteInfo,
  type QuoteRequest,
  type RouteStep,
  type GasEstimate,
  type FeeInfo,
} from "../types";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
// import { calculateAvnuEstimatedOutput, calculateAvnuTotalCost, getTokenQuotes } from "@/utils/utils";

export class RouteService {
  async findBestRoutes(request: QuoteRequest): Promise<RouteInfo[]> {
    try {
      logger.info("Finding routes", { request });

      const routes: RouteInfo[] = [];

      // Implement intra-chain DEX SWAP FUNCTIONS FOR EACH CHAIN i.e Starknet -> Starknet, EVM -> EVM, Solana -> Solana

      // Check if same chain (DEX swap only)
      if (request.fromChain === request.toChain) {
        const swapRoutes = await this.findSwapRoutes(request);
        if (swapRoutes) {
          routes.push(...swapRoutes);
        }
      } else {
        // Cross-chain routes (bridge + optional swaps)
        const bridgeRoutes = await this.findBridgeRoutes(request);
        routes.push(...bridgeRoutes);
      }

      // Sort routes by total cost (ascending)
      routes.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));

      logger.info("Routes found", { count: routes.length, request });
      return routes;
    } catch (error) {
      logger.error("Failed to find routes", { error, request });
      throw error;
    }
  }

  private async findSwapRoutes(request: QuoteRequest): Promise<RouteInfo[] | null> {
    // TODO: Implement Stellar DEX quote fetching
    // const quotes = await getTokenQuotes(request);
    const quotes: any[] = [];

    const routeInfo: RouteInfo[] = quotes.map((quote) => {
      const feeEstimate: GasEstimate = {
        // gasLimit: quote.gasFees.toString(),
        gasPrice: quote.gasFees.toString(),
        serviceCost: (quote.fee.avnuFees + quote.fee.integratorFees).toString(),
        totalCost: (quote.gasFees + quote.fee.avnuFees + quote.fee.integratorFees).toString(),
      };

      const feeInfo: FeeInfo = {
        gasFee: quote.gasFees.toString(),
        total: quote.gasFees.toString(),
      };

      const step: RouteStep = {
        type: "swap",
        provider: "avnu",
        fromChain: request.fromChain,
        toChain: request.toChain,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        // TODO: Calculate real estimated output amount
        // estimatedOutput: calculateAvnuEstimatedOutput(quote, 3),
        estimatedOutput: "0",
        fees: feeInfo,
      };

      return {
        id: uuidv4(),
        serviceId: quote.quoteId,
        steps: [step],
        // TODO: Calculate real total route cost
        // totalCost: calculateAvnuTotalCost(quote, 3),
        totalCost: "0",
        estimatedTime: 2000, // return a real value later
        slippageTolerance: request.slippageTolerance || 0.005,
        gasEstimate: feeEstimate,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      };
    });

    return routeInfo;
  }

  // NOT IN USE RIGHT NOW
  private async findBridgeRoutes(request: QuoteRequest): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Mock bridge routes for different providers
    const providers = ["across", "stargate", "orbiter"];

    for (const provider of providers) {
      const route = await this.createBridgeRoute(request, provider);
      if (route) {
        routes.push(route);
      }
    }

    return routes;
  }

  // NOT IN USE RIGHT NOW
  private async createBridgeRoute(request: QuoteRequest, provider: string): Promise<any | null> {
    const gasEstimate: GasEstimate = {
      // gasLimit: "300000",
      gasPrice: "25000000000", // 25 gwei
      totalCost: "0.0075", // ETH
      serviceCost: "",
    };

    const bridgeFees: FeeInfo = {
      bridgeFee: "0.01",
      gasFee: "0.0075",
      protocolFee: "0.002",
      total: "0.0195",
    };

    const steps: RouteStep[] = [];

    // If tokens are different, add swap on source chain
    if (request.fromToken !== request.toToken) {
      steps.push({
        type: "swap",
        provider: "1inch",
        fromChain: request.fromChain,
        toChain: request.fromChain,
        fromToken: request.fromToken,
        toToken: request.toToken, // Swap to bridge-compatible token
        amount: request.amount,
        estimatedOutput: (parseFloat(request.amount) * 0.997).toString(),
        fees: {
          gasFee: "0.003",
          protocolFee: "0.001",
          total: "0.004",
        },
      });
    }

    // Add bridge step
    steps.push({
      type: "bridge",
      provider,
      fromChain: request.fromChain,
      toChain: request.toChain,
      fromToken: request.toToken,
      toToken: request.toToken,
      amount: steps.length > 0 ? steps[0].estimatedOutput : request.amount,
      estimatedOutput: (parseFloat(request.amount) * 0.99).toString(), // 1% bridge fee
      fees: bridgeFees,
    });

    return {
      id: uuidv4(),
      steps,
      totalCost: bridgeFees.total,
      estimatedTime: provider === "across" ? 120 : 300, // seconds
      slippageTolerance: request.slippageTolerance || 0.01,
      gasEstimate,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }
}
