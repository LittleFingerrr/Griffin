# Griffin

**Pay with anything. Arrive in whatever is required.**

Griffin is an intent-based cross-chain payment protocol. A user pays in any token they hold. The recipient receives exactly the token they need. Griffin handles everything in between — conversion, routing, bridging, and settlement — in a single signed intent.

---

## The Problem

Crypto payments have a token mismatch problem. A merchant wants USDC. A user holds HSK. An NFT costs a token you don't own. Today, the user stops, navigates to an exchange, swaps manually, returns, and completes the payment. That is four steps too many.

Griffin collapses this to one. The user signs a single intent. Griffin resolves the mismatch and delivers exactly what the recipient asked for.

---

## How It Works

Griffin follows a strict **intent-based model**. The user expresses *what* they want to happen. Griffin determines *how* to make it happen.

```
User signs intent
      │
      ▼
IntentService validates + stores
      │
      ▼
SettlementEngine evaluates settlers in priority order
      │
      ├─ InventorySettler  →  Griffin holds the output token? Send directly.
      ├─ SwapSettler       →  Same-chain pair? Route through GriffinDEX.
      └─ BridgeSettler     →  Cross-chain? Route through Superbridge.
      │
      ▼
On-chain transaction submitted + confirmed
      │
      ▼
Intent marked COMPLETED — recipient has their tokens
```

The user never touches a DEX. The user never bridges manually. The user signs once.

---

## Architecture

Griffin is a pnpm monorepo with four packages and a utility scripts layer.

```
Griffin/
├── packages/
│   ├── orchestrator/     # The backend brain — intent processing, routing, settlement
│   ├── sdk/              # Typed HTTP client for dApp developers
│   ├── contracts/        # GriffinDEX AMM + MockERC20 (Hardhat, deployed on Hashkey)
│   └── app/              # Minimal React demo frontend (Vite + wagmi)
├── scripts/
│   └── test-sdk.ts       # End-to-end smoke test against a live orchestrator
└── docs/
    ├── ARCHITECTURE.md
    └── RESOURCES.md
```

---

## The Settlement Architecture — Pluggability by Design

The most deliberate architectural decision in Griffin is the **settler pattern**. Every settlement mechanism — whether it moves tokens from Griffin's own vault, routes through an on-chain AMM, or calls a cross-chain bridge — implements a single interface:

```typescript
interface ISettler {
  readonly type: SettlerType;
  canSettle(intent: Intent): Promise<SettleabilityCheck>;
  settle(intent: Intent): Promise<SettlementResult>;
}
```

The `SettlementEngine` holds an ordered list of settlers. For each intent, it calls `canSettle()` on each settler in sequence. The first one that returns `capable: true` handles the intent. The engine never knows — or cares — which settler wins.

This means adding a new settlement mechanism is a single file and a one-line registration:

```typescript
// app.ts — the entire wiring change to add a new settler
const settlementEngine = new SettlementEngine([
  new InventorySettler(chainClients, vaultAddress),
  new SwapSettler(dexClients, chainClients),
  new BridgeSettler(bridgeClients, chainClients, vaultAddress),
  new AcrossSettler(...),   // ← add this, nothing else changes
]);
```

The same pattern extends to the blockchain client layer. Every chain integration implements `IChainClient`. Every DEX integration implements `IDexClient`. Every bridge integration implements `IBridgeClient`. Settlers depend only on these interfaces — never on concrete implementations.

### Current Settlers

| Settler | Trigger | Mechanism |
|---|---|---|
| `InventorySettler` | Griffin holds the output token | Direct ERC-20 transfer from Griffin's vault |
| `SwapSettler` | Same-chain, different tokens | `GriffinDEX.swapToRecipient()` — constant product AMM |
| `BridgeSettler` | Cross-chain intent | Superbridge API — multi-step bridge execution |

### Settlement Priority

Inventory is tried first (fastest, no slippage, no external dependency). Swap is tried second (same-chain, on-chain AMM). Bridge is the fallback for cross-chain intents. The priority is explicit and configurable at startup.

---

## Packages

### `packages/orchestrator` — The Backend

The orchestrator is a Node.js/TypeScript Express server. It is the only component that holds private keys and talks to chains. It runs 24/7 and processes intents.

**Key modules:**

- `IntentService` — creates, validates (including EIP-712 signature verification), and manages intent lifecycle
- `SettlementEngine` — settler selection and delegation
- `ChainService` — registry of supported chains and tokens
- `RouteService` — quote generation for cross-chain routes
- `blockchain/` — chain client implementations (`EvmClient`, `DexClient`, `SuperbridgeClient`) behind clean interfaces (`IChainClient`, `IDexClient`, `IBridgeClient`)
- `settlement/` — settler implementations (`InventorySettler`, `SwapSettler`, `BridgeSettler`)

**Test coverage:** 170+ unit tests across all services, settlers, routes, and middleware. Tests run against mock interfaces — no real chain, no real API key required.

### `packages/sdk` — The Client Library

A typed HTTP client that wraps the orchestrator's REST API. Zero dependencies beyond native `fetch`. Works in Node 18+, browsers, and edge runtimes.

```typescript
import { GriffinClient } from "@griffin/sdk";

const griffin = new GriffinClient({ baseUrl: "https://your-orchestrator.xyz" });

const intent = await griffin.createIntent({
  fromChain: "eip155:133",
  toChain: "eip155:1",
  fromToken: "0x...",
  toToken: "0x...",
  amount: "10",
  recipient: "0x...",
  userAddress: "0x...",
  requestMessage: signedMessage,
  requestSignature: signature,
});

await griffin.executeIntent(intent.intentId);
```

The SDK is a workspace package — no npm publish required. Any app in the monorepo imports it directly via a Vite alias.

### `packages/contracts` — On-Chain Contracts

Hardhat project deployed on **Hashkey Testnet** (chain ID 133).

- **`GriffinDEX.sol`** — a minimal constant-product AMM (Uniswap v2 style) with a `swapToRecipient(tokenIn, tokenOut, amountIn, minAmountOut, recipient)` function. This is Griffin's core primitive: the sender pays, the recipient receives, in one atomic transaction.
- **`MockERC20.sol`** — configurable test token (name, symbol, decimals, initial supply). Used to seed liquidity pools and fund Griffin's vault for demos.

**Deployed contracts (Hashkey Testnet):**
- `GriffinDEX`: `0x16279052BFEde721ed2662F41A754966a3E48124`
- `tHSK` (Test HSK, 18 decimals): `0xb8F355f10569FD2A765296161d082Cc37c5843c2`
- `tUSDC` (Test USDC, 6 decimals): `0xc4C2841367016C9e2652Fecc49bBA9229787bA82`

### `packages/app` — The Demo Frontend

A minimal Vite + React application that demonstrates the full Griffin flow in a browser.

- Connects to MetaMask via wagmi
- Prompts the user to sign an EIP-712 typed data message authorising the intent
- Submits the intent to the orchestrator via the SDK
- Polls for completion and shows the result

The frontend is intentionally minimal — its purpose is to prove the integration story, not to be a production UI.

---

## The Blockchain Client Layer

Every chain, DEX, and bridge is hidden behind an interface. Settlers never import concrete clients.

```
IChainClient          IDexClient            IBridgeClient
     │                    │                      │
     ▼                    ▼                      ▼
EvmClient           DexClient            SuperbridgeClient
StellarClient*      (GriffinDEX)         (+ AcrossClient, HopClient...)
StarknetClient*
```

`*` = stubbed, ready for implementation

Adding Starknet support means creating `StarknetClient implements IChainClient`. The settlers, the engine, and the API don't change.

---

## EIP-712 Signature Verification

Every intent requires a user signature. Griffin uses EIP-712 typed data — not a raw message hash — so MetaMask shows the user a structured, human-readable authorisation prompt:

```
Sign this data:
  fromToken:   0xb8F355...
  toToken:     0xc4C284...
  amount:      10
  recipient:   0x345b10...
  userAddress: 0xB1655b...
  nonce:       1713000000000
```

The orchestrator reconstructs the same typed data from `requestMessage` and calls `ethers.verifyTypedData()` to confirm the signature matches `userAddress`. Replay attacks are prevented by the `nonce` (timestamp).

---

## Scripts

### `scripts/test-sdk.ts`

End-to-end smoke test against a live orchestrator. Runs the full flow: health check → supported chains → quote → create intent → execute → poll for completion.

```bash
USER_ADDRESS=0x... RECIPIENT=0x... npx tsx scripts/test-sdk.ts
```

### `packages/contracts/scripts/deployTokens.ts`

Deploys `MockERC20` tokens and seeds a `GriffinDEX` liquidity pool in one command.

```bash
cd packages/contracts && pnpm deploy:tokens
```

### `packages/contracts/scripts/approveTokens.ts`

Approves `GriffinDEX` to spend Griffin's vault tokens (required before the first swap).

```bash
cd packages/contracts && pnpm approve:tokens
```

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Configure the orchestrator
cp packages/orchestrator/.env.example packages/orchestrator/.env
# Fill in: GRIFFIN_OPERATOR_PRIVATE_KEY, GRIFFIN_VAULT_ADDRESS,
#          GRIFFIN_DEX_ADDRESS, SUPERBRIDGE_API_KEY

# Start the orchestrator
cd packages/orchestrator && pnpm dev

# In a second terminal — start the demo app
cd packages/app && pnpm dev

# Run all tests
pnpm test
```

---

## CI

Three parallel jobs run on every push and pull request:

| Job | What it checks |
|---|---|
| `orchestrator` | TypeScript, lint, format, build, 129 Jest unit tests |
| `contracts` | Hardhat compile + 21 Solidity tests (GriffinDEX + MockERC20) |
| `sdk` | TypeScript, build, 22 Vitest unit tests |

Total: **172 automated tests** across the full stack.

---

## Design Principles

**Interfaces before implementations.** Every external dependency — chains, DEXes, bridges — is hidden behind a TypeScript interface. This made the codebase testable from day one and makes it extensible without touching existing code.

**Settlers are stateless.** All intent state lives on the `Intent` object. Settlers read it, act on it, and return a result. They never mutate shared state. This makes the settlement layer safe to reason about and trivial to test.

**Graceful degradation.** If a settler can't handle an intent — missing API key, insufficient liquidity, wrong chain — it declines with a reason. The engine moves to the next settler. Nothing crashes. The user gets a clear error only if every settler declines.

**The orchestrator owns the keys.** Private keys never leave the server. The SDK is a thin HTTP client. The frontend signs a typed message — it never touches a private key. Griffin's vault is the only wallet that moves funds.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Chain | Hashkey Testnet (EVM, chain ID 133) |
| Smart Contracts | Solidity 0.8.20, OpenZeppelin 5, Hardhat |
| Orchestrator | Node.js 20, TypeScript 5, Express 5 |
| Settlement | Custom settler pattern — pluggable by design |
| Bridge | Superbridge API |
| Wallet | MetaMask via wagmi v2 + viem |
| Frontend | Vite + React 18 |
| SDK | Native fetch, zero runtime dependencies |
| Testing | Jest (orchestrator), Hardhat/Chai (contracts), Vitest (SDK) |
| Monorepo | pnpm workspaces |

---

## License

MIT — see [LICENSE](./LICENSE).
