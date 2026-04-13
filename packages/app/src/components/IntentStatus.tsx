import type { IntentState } from "../hooks/useIntent";

export function IntentStatus({ state, onReset }: { state: IntentState; onReset: () => void }) {
  const success = state.status === "completed";
  return (
    <div className={`intent-result ${success ? "success" : "failure"}`}>
      <div className="result-icon">{success ? "✅" : "❌"}</div>
      <h3>{success ? "Payment sent!" : "Payment failed"}</h3>
      {state.intentId && <p className="intent-id">Intent: {state.intentId}</p>}
      {state.error && <p className="error-msg">{state.error}</p>}
      <button onClick={onReset}>New payment</button>
    </div>
  );
}
