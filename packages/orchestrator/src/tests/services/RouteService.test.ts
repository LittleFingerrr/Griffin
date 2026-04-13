import { RouteService } from "../../services/RouteService";
import { QuoteRequest } from "../../types";

const baseRequest: QuoteRequest = {
  fromChain: "stellar:testnet",
  toChain: "stellar:testnet",
  fromToken: "GABCDE",
  toToken: "GXYZ12",
  amount: "100",
  slippageTolerance: 0.01,
};

describe("RouteService.getQuotes", () => {
  let service: RouteService;

  beforeEach(() => {
    service = new RouteService();
  });

  it("returns an array for same-chain request", async () => {
    const routes = await service.getQuotes(baseRequest);
    expect(Array.isArray(routes)).toBe(true);
  });

  it("returns empty array for same-chain when no DEX quotes available", async () => {
    // findSwapRoutes returns empty because getTokenQuotes is not implemented yet
    const routes = await service.getQuotes(baseRequest);
    expect(routes).toHaveLength(0);
  });

  it("returns routes for cross-chain request", async () => {
    const crossChain: QuoteRequest = {
      ...baseRequest,
      toChain: "eip155:1",
    };
    const routes = await service.getQuotes(crossChain);
    expect(routes.length).toBeGreaterThan(0);
  });

  it("cross-chain routes each have required RouteInfo fields", async () => {
    const crossChain: QuoteRequest = { ...baseRequest, toChain: "eip155:1" };
    const routes = await service.getQuotes(crossChain);

    for (const route of routes) {
      expect(route.id).toBeDefined();
      expect(route.steps).toBeDefined();
      expect(Array.isArray(route.steps)).toBe(true);
      expect(route.totalCost).toBeDefined();
      expect(route.estimatedTime).toBeGreaterThan(0);
      expect(route.gasEstimate).toBeDefined();
      expect(route.createdAt).toBeInstanceOf(Date);
      expect(route.expiresAt).toBeInstanceOf(Date);
    }
  });

  it("cross-chain routes are sorted by totalCost ascending", async () => {
    const crossChain: QuoteRequest = { ...baseRequest, toChain: "eip155:1" };
    const routes = await service.getQuotes(crossChain);

    for (let i = 1; i < routes.length; i++) {
      expect(parseFloat(routes[i].totalCost)).toBeGreaterThanOrEqual(
        parseFloat(routes[i - 1].totalCost),
      );
    }
  });

  it("uses default slippageTolerance when not provided", async () => {
    const req: QuoteRequest = { ...baseRequest, toChain: "eip155:1" };
    delete (req as any).slippageTolerance;
    const routes = await service.getQuotes(req);
    for (const route of routes) {
      expect(route.slippageTolerance).toBeDefined();
    }
  });

  it("cross-chain routes contain a bridge step", async () => {
    const crossChain: QuoteRequest = { ...baseRequest, toChain: "eip155:1" };
    const routes = await service.getQuotes(crossChain);

    for (const route of routes) {
      const hasBridge = route.steps.some((s) => s.type === "bridge");
      expect(hasBridge).toBe(true);
    }
  });

  it("route expiresAt is in the future", async () => {
    const crossChain: QuoteRequest = { ...baseRequest, toChain: "eip155:1" };
    const routes = await service.getQuotes(crossChain);
    const now = Date.now();

    for (const route of routes) {
      expect(route.expiresAt.getTime()).toBeGreaterThan(now);
    }
  });
});
