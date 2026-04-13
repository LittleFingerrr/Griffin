import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { TOKENS } from "../config";
import { useQuote } from "../hooks/useQuote";
import { useIntent } from "../hooks/useIntent";
import { IntentStatus } from "./IntentStatus";

export function SwapForm() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const fromToken = TOKENS.tHSK.address;
  const toToken = TOKENS.tUSDC.address;

  const { quote, loading: quoteLoading } = useQuote(fromToken, toToken, amount);
  const { state, submit, reset } = useIntent();

  const isActive = state.status !== "idle" && state.status !== "completed" && state.status !== "failed";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    await submit({
      fromToken,
      toToken,
      amount,
      recipient,
      userAddress: address,
      signTypedData: (args) => signTypedDataAsync(args as any),
    });
  }

  if (state.status === "completed" || state.status === "failed") {
    return <IntentStatus state={state} onReset={reset} />;
  }

  return (
    <form className="swap-form" onSubmit={handleSubmit}>
      <h2>Send Payment</h2>

      <div className="token-row">
        <span className="token-label">You send</span>
        <span className="token-badge">{TOKENS.tHSK.symbol}</span>
      </div>

      <div className="field">
        <label>Amount</label>
        <input
          type="number"
          placeholder="0.0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          min="0"
          step="any"
          required
        />
      </div>

      <div className="token-row">
        <span className="token-label">Recipient receives</span>
        <span className="token-badge">{TOKENS.tUSDC.symbol}</span>
      </div>

      {amount && !quoteLoading && quote?.bestRoute && (
        <div className="quote-preview">
          ≈ {quote.bestRoute.steps[0]?.estimatedOutput} tUSDC
        </div>
      )}

      <div className="field">
        <label>Recipient address</label>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          required
        />
      </div>

      {isActive && (
        <div className="status-inline">
          {state.status === "signing" && "⏳ Waiting for signature..."}
          {state.status === "submitting" && "⏳ Submitting intent..."}
          {state.status === "polling" && "⏳ Executing swap..."}
        </div>
      )}

      {state.error && <div className="error">{state.error}</div>}

      <button type="submit" disabled={!isConnected || isActive}>
        {!isConnected ? "Connect wallet first" : isActive ? "Processing..." : "Send"}
      </button>
    </form>
  );
}
