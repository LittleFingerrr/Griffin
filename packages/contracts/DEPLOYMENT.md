# Deploying GriffinDEX to HashKey Chain Testnet

## Prerequisites

1. **Get testnet HSK tokens**
   - Visit HashKey Chain testnet faucet (check their official docs)
   - Or bridge tokens using [thirdweb bridge](https://thirdweb.com/hashkey-chain-testnet)

2. **Export your private key**
   - From MetaMask: Account Details → Export Private Key
   - **NEVER share or commit this key**

## Network Information

- **Chain ID**: 133 (0x85)
- **Network Name**: HashKey Chain Testnet
- **RPC URL**: https://testnet.hsk.xyz
- **Currency**: HSK
- **Block Explorer**: https://testnet-explorer.hsk.xyz

## Deployment Steps

### 1. Configure Environment

```bash
cd packages/contracts
cp .env.example .env
```

Edit `.env` and add your private key:
```bash
PRIVATE_KEY=your_private_key_without_0x_prefix
HASHKEY_RPC_URL=https://testnet.hsk.xyz
```

### 2. Verify Compilation

```bash
pnpm compile
```

Should output: `Compiled 11 Solidity files successfully`

### 3. Check Your Balance

```bash
npx hardhat run scripts/deploy.ts --network hashkey
```

This will show your account address and balance before deploying.

### 4. Deploy Contract

```bash
pnpm deploy:hashkey
```

Expected output:
```
Deploying GriffinDEX to HashKey Chain...
Deploying with account: 0x...
Account balance: ...
GriffinDEX deployed to: 0x...

Save this address to your .env file:
GRIFFIN_DEX_ADDRESS=0x...
```

### 5. Verify Deployment

Visit the block explorer:
```
https://testnet-explorer.hsk.xyz/address/YOUR_CONTRACT_ADDRESS
```

### 6. Save Contract Address

Add the deployed address to your `.env`:
```bash
GRIFFIN_DEX_ADDRESS=0xYourDeployedContractAddress
```

## Troubleshooting

### "Insufficient funds"
- Get more HSK from the testnet faucet
- Check your balance: `npx hardhat run scripts/check-balance.ts --network hashkey`

### "Invalid private key"
- Ensure no `0x` prefix in `.env`
- Private key should be 64 hex characters

### "Network connection failed"
- Try alternative RPC: `https://hashkey-testnet.drpc.org`
- Check your internet connection

### "Nonce too high"
- Reset your account in MetaMask: Settings → Advanced → Clear activity tab data

## Alternative RPC Endpoints

If the primary RPC is slow or unavailable:
```bash
# In .env
HASHKEY_RPC_URL=https://hashkey-testnet.drpc.org
# or
HASHKEY_RPC_URL=https://hashkeychain-testnet.alt.technology
```

## Next Steps

After deployment:
1. Create initial liquidity pools for token pairs
2. Test swaps using the `swapToRecipient` function
3. Integrate contract address into Griffin orchestrator
4. Update `ChainService` to support HashKey Chain
