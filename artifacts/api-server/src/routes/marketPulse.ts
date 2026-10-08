import { Router } from "express";
import type { MarketPulseService } from "../lib/marketPulseService.ts";

export function createMarketPulseRouter(
  service: Pick<MarketPulseService, "getSnapshot">,
  isMarketOpen: () => Promise<boolean>,
  onFailure?: (err: unknown) => void,
) {
  const router = Router();

  router.get("/stocks/market-pulse", async (_req, res) => {
    try {
      const [data, marketOpen] = await Promise.all([
        service.getSnapshot(),
        isMarketOpen(),
      ]);
      res.set("Cache-Control", "public, max-age=30").json({ ...data, marketOpen });
    } catch (err: unknown) {
      onFailure?.(err);
      res.status(422).json({
        error: "MARKET_PULSE_FAILED",
        message: "The total-market signal is temporarily unavailable. Try again shortly.",
      });
    }
  });

  return router;
}
