import { useState } from "react";
import { useGriffinClient } from "./useGriffinClient";
import type { IntentStatus } from "@griffin/sdk";

export type IntentState = {
  status: "idle" | "signing" | "submitting" | "polling" | IntentStatus;
  intentId?: string;
  error?: string;
};

export function useIntent() {
  const client = useGriffinClient();
  const [state, setState] = useState<IntentState>({ status: "idle" });

  async function submit(params: {
    fromToken: string;
    toToken: string;
    amount: string;
    recipient: string;
    userAddress: string;
    signMessage: (msg: string) => Promise<string>;
  }) {
    try {
      setState({ status: "signing" });

      const message = JSON.stringify({
        fromChain: "eip155:133",
        toChain: "eip155:133",
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        recipient: params.recipient,
        userAddress: params.userAddress,
        nonce: Date.now(),
      });

      const signature = await params.signMessage(message);

      setState({ status: "submitting" });

      const intent = await client.createIntent({
        fromChain: "eip155:133",
        toChain: "eip155:133",
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        recipient: params.recipient,
        userAddress: params.userAddress,
        requestMessage: message,
        requestSignature: signature,
      });

      setState({ status: "polling", intentId: intent.intentId });

      await client.executeIntent(intent.intentId);

      // Poll for completion
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const updated = await client.getIntent(intent.intentId);
        setState({ status: updated.status as IntentStatus, intentId: intent.intentId });
        if (updated.status === "completed" || updated.status === "failed") break;
      }
    } catch (e: unknown) {
      setState({ status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function reset() { setState({ status: "idle" }); }

  return { state, submit, reset };
}
