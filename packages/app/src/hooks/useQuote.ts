import { useState, useEffect } from "react";
import { useGriffinClient } from "./useGriffinClient";
import type { QuoteResponse } from "@griffin/sdk";

export function useQuote(fromToken: string, toToken: string, amount: string) {
  const client = useGriffinClient();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) { setQuote(null); return; }
    setLoading(true);
    setError(null);
    client.getQuote({ fromChain: "eip155:133", toChain: "eip155:133", fromToken, toToken, amount })
      .then(setQuote)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fromToken, toToken, amount]);

  return { quote, loading, error };
}
