# Griffin

**Pay with anything. Arrive in whatever is required.**

Griffin is an open-source, intent-based payment protocol. It lets a user pay in any token they hold — and ensures the recipient receives exactly the token they require — without the user ever having to manually swap.

> V1 is built on Stellar. Multichain expansion is on the roadmap.

---

## The Problem

Crypto payments have a token mismatch problem. A dApp charges in USDC. A merchant wants XLM. An NFT costs a specific token you don't hold. Today, the user has to stop, go to an exchange, swap manually, return, and then complete the payment. That is too many steps.

Griffin eliminates the mismatch. The user signs one intent. Griffin handles the conversion and completes the payment on their behalf — atomically.

---

## How It Works

Griffin follows an **Intent-Based Model**. The user expresses *what* they want to happen. Griffin ensures the destination payment is satisfied.

### The Flow

1. **Quote** — The user indicates what they want to pay for and what token they hold. Griffin returns a quote: "You'll pay ~200 XLM to cover this 50 USDC payment."
2. **Intent** — The user signs a single authorization. No manual swap. No extra steps.
3. **Execution** — Griffin routes the payment through Stellar's native DEX (SDEX) using a `path_payment_strict_receive` operation. The conversion and payment happen atomically in one transaction.
4. **Settlement** — The recipient receives exactly what they asked for. The user spent exactly what they agreed to.

If the transaction cannot be completed within the agreed parameters (e.g. slippage exceeded), it reverts entirely. No funds are lost.

---

## Architecture

Griffin is a monorepo with three layers:
```
Griffin/
├── packages/
│   ├── orchestrator/     # Backend service: intent processing, routing, execution
│   ├── sdk/              # (Planned) Client-side SDK for dApp developers
│   └── contracts/        # (Planned) On-chain escrow and settlement contracts
└── docs/                 # Architecture docs and decisions
```

### Core Services (Orchestrator)

| Service | Responsibility |
|---|---|
| `IntentService` | Creates, validates, and manages payment intents |
| `RouteService` | Finds the best conversion path via SDEX |
| `ChainService` | Manages supported chains and tokens |

### Technology Stack (V1 — Stellar)

| Component | Technology |
|---|---|
| Chain | Stellar (Testnet → Mainnet) |
| Swap / Routing | Stellar SDEX — `path_payment_strict_receive` |
| Wallet Integration | Freighter |
| Orchestrator | Node.js / TypeScript |
| Asset Standard | Stellar Asset Contract (SAC) — native USDC |

---

## Why Stellar First

Stellar has unique primitives that make Griffin's core promise — atomic, single-step cross-asset payments — achievable without complex bridging infrastructure:

- **Path Payments** are native to the protocol. Swap and pay in one transaction. If any leg fails, everything reverts.
- **SDEX** provides on-chain liquidity for major asset pairs without needing external DEX integrations.
- **Native USDC** is issued by Circle directly on Stellar — no wrapped tokens, no bridge risk.
- **3–5 second finality** means payments feel instant.

---

## Roadmap

- [x] Orchestrator architecture and intent model
- [x] Chain-agnostic type system
- [ ] Stellar SDEX path payment integration
- [ ] Freighter wallet connection
- [ ] Quote engine (SDEX route discovery)
- [ ] Slippage buffer and intent expiry logic
- [ ] Client-side SDK (`@griffin/sdk`)
- [ ] Testnet demo: pay in XLM, recipient receives USDC
- [ ] Fee engine
- [ ] Soroban escrow contract (claimable balance escrow)
- [ ] Multichain expansion (EVM chains via bridge)

---

## Contributing

Griffin is open source and actively looking for contributors. It is listed on [Drips](https://drips.network) for open-source funding.

### Getting Started
```bash
# Clone the repo
git clone https://github.com/LittleFingerrr/Griffin.git
cd Griffin

# Install dependencies
pnpm install

# Set up environment variables
cp packages/orchestrator/.env.example packages/orchestrator/.env

# Run the orchestrator
cd packages/orchestrator
pnpm dev
```

### Good First Issues

Look for issues tagged `good first issue` in the GitHub Issues tab. Each issue has a scoped description, acceptance criteria, and relevant files listed so you can get started without needing to understand the entire codebase.

### Guidelines

- TypeScript throughout — strict mode enabled
- One concern per service — keep `IntentService`, `RouteService`, and `ChainService` focused
- Tests required for any logic touching funds or routing
- Open a discussion issue before starting large features

---

## Architecture Decisions

Key decisions are documented in `docs/`. Before contributing to core routing or fee logic, read:

- `docs/slippage-policy.md` — how Griffin handles price movement during execution
- `docs/fee-model.md` — how Griffin charges for conversions
- `docs/intent-lifecycle.md` — full state machine for a payment intent

> These documents are works in progress and contributions to them are welcome.

---

## License

MIT — see [LICENSE](./LICENSE).
