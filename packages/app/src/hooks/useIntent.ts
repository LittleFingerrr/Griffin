import { useState } from "react";
import { useGriffinClient } from "./useGriffinClient";
import type { IntentStatus } from "@griffin/sdk";

export type IntentState = {
  status: "idle" | "signing" | "submitting" | "polling" | IntentStatus;
  intentId?: string;
  error?: string;
};

// Must match the EIP-712 types defined in the orchestrator's validateEvmSignature
const INTENT_DOMAIN = {
  name: "Griffin",
  version: "1",
  chainId: 133, // Hashkey testnet
} as const;

const INTENT_TYPES = {
  IntentAuthorization: [
    { name: "fromToken",    type: "address" },
    { name: "toToken",      type: "address" },
    { name: "amount",       type: "string"  },
    { name: "recipient",    type: "address" },
    { name: "userAddress",  type: "address" },
    { name: "nonce",        type: "uint256" },
  ],
} as const;

export function useIntent() {
  const client = useGriffinClient();
  const [state, setState] = useState<IntentState>({ status: "idle" });

  async function submit(params: {
    fromToken: string;
    toToken: string;
    amount: string;
    recipient: string;
    userAddress: string;
    signTypedData: (args: {
      domain: typeof INTENT_DOMAIN;
      types: typeof INTENT_TYPES;
      primaryType: "IntentAuthorization";
      message: Record<string, unknown>;
    }) => Promise<string>;
  }) {
    try {
      setState({ status: "signing" });

      const nonce = Date.now();

      const typedMessage = {
        fromToken:   params.fromToken,
        toToken:     params.toToken,
        amount:      params.amount,
        recipient:   params.recipient,
        userAddress: params.userAddress,
        nonce,
      };

      const signature = await params.signTypedData({
        domain: INTENT_DOMAIN,
        types: INTENT_TYPES,
        primaryType: "IntentAuthorization",
        message: typedMessage,
      });

      // requestMessage carries the typed data so the orchestrator can reconstruct it
      const requestMessage = JSON.stringify({
        fromChain: "eip155:133",
        toChain: "eip155:133",
        ...typedMessage,
      });

      setState({ status: "submitting" });

      const intent = await client.createIntent({
        fromChain: "eip155:133",
        toChain: "eip155:133",
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        recipient: params.recipient,
        userAddress: params.userAddress,
        requestMessage,
        requestSignature: signature,
      });

      setState({ status: "polling", intentId: intent.intentId });

      await client.executeIntent(intent.intentId);

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
