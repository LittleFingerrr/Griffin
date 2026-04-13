import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HASHKEY_TESTNET } from "./config";
import { WalletButton } from "./components/WalletButton";
import { SwapForm } from "./components/SwapForm";
import "./index.css";

const wagmiConfig = createConfig({
  chains: [HASHKEY_TESTNET],
  transports: { [HASHKEY_TESTNET.id]: http() },
});

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="app">
          <header>
            <h1>Griffin</h1>
            <p className="tagline">Cross-token payments, simplified</p>
            <WalletButton />
          </header>
          <main>
            <SwapForm />
          </main>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
