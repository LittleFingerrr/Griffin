# Griffin DEX Contracts

Smart contracts for Griffin protocol on HashKey Chain.

## GriffinDEX

A minimal DEX implementation that enables Griffin's core use case: swapping tokens with a separate recipient address.

### Key Features

- **Swap to Recipient**: `swapToRecipient()` allows paying from one address and delivering to another
- **Liquidity Pools**: Standard AMM with constant product formula (x * y = k)
- **0.3% Trading Fee**: Industry-standard fee structure
- **Slippage Protection**: `minAmountOut` parameter prevents excessive slippage
- **Security**: ReentrancyGuard, SafeERC20, and Ownable from OpenZeppelin

### Core Functions

```solidity
// Create a new trading pair
function createPool(address tokenA, address tokenB) external returns (bytes32)

// Add liquidity to earn fees
function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) 
    external returns (uint256 liquidity)

// Remove liquidity
function removeLiquidity(address tokenA, address tokenB, uint256 liquidity) 
    external returns (uint256 amountA, uint256 amountB)

// Swap with separate recipient (Griffin's core feature)
function swapToRecipient(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    address recipient
) external returns (uint256 amountOut)

// Get quote for swap
function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
    public pure returns (uint256)
```

## Setup

```bash
cd packages/contracts
pnpm install
```

## Configuration

Create `.env` file:

```bash
PRIVATE_KEY=your_private_key_here
HASHKEY_RPC_URL=https://testnet.hsk.xyz
```

## Compile

```bash
pnpm compile
```

## Deploy

### Local (Hardhat)
```bash
pnpm hardhat node
pnpm deploy
```

### HashKey Chain Testnet
```bash
pnpm deploy:hashkey
```

## Usage Example

```typescript
// 1. Create a pool
await dex.createPool(tokenA.address, tokenB.address);

// 2. Add liquidity
await tokenA.approve(dex.address, amountA);
await tokenB.approve(dex.address, amountB);
await dex.addLiquidity(tokenA.address, tokenB.address, amountA, amountB);

// 3. Swap (Griffin use case: user pays, recipient receives)
await tokenA.approve(dex.address, amountIn);
await dex.swapToRecipient(
  tokenA.address,    // Token user is paying with
  tokenB.address,    // Token recipient wants
  amountIn,          // Amount user is paying
  minAmountOut,      // Slippage protection
  recipientAddress   // Where the output tokens go
);
```

## Integration with Griffin Orchestrator

The orchestrator will:
1. Get quote via `getAmountOut()`
2. Create intent with user signature
3. Execute swap via `swapToRecipient()` with user as sender, merchant as recipient
4. Monitor transaction completion

## Security Considerations

- All external calls use SafeERC20
- ReentrancyGuard on all state-changing functions
- Slippage protection via `minAmountOut`
- Pool reserves updated before transfers
- Minimum liquidity requirement prevents division by zero

## License

MIT
