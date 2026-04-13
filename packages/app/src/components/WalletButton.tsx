import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="wallet-connected">
        <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <button className="wallet-connect-btn" onClick={() => connect({ connector: injected() })}>
      Connect Wallet
    </button>
  );
}
