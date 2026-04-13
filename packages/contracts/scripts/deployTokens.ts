import { ethers } from "hardhat";

/**
 * Deploys two MockERC20 tokens (tHSK and tUSDC) to the target network,
 * then seeds a GriffinDEX liquidity pool with both tokens.
 *
 * Prerequisites:
 *   - PRIVATE_KEY set in .env (deployer wallet, must have gas)
 *   - GRIFFIN_DEX_ADDRESS set in .env (already deployed GriffinDEX)
 *
 * Run:
 *   npx hardhat run scripts/deployTokens.ts --network hashkey
 */

const DEX_ADDRESS = process.env.GRIFFIN_DEX_ADDRESS || "";

// Initial supply minted to deployer for each token
const THSK_SUPPLY = 1_000_000n;   // 1M tHSK  (18 decimals)
const TUSDC_SUPPLY = 1_000_000n;  // 1M tUSDC (6 decimals)

// Liquidity to seed the pool with
const POOL_THSK  = ethers.parseUnits("10000", 18);  // 10,000 tHSK
const POOL_TUSDC = ethers.parseUnits("10000", 6);   // 10,000 tUSDC

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HSK\n");

  // -------------------------------------------------------------------------
  // 1. Deploy tHSK
  // -------------------------------------------------------------------------
  console.log("Deploying tHSK...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tHSK = await MockERC20.deploy("Test HSK", "tHSK", 18, THSK_SUPPLY);
  await tHSK.waitForDeployment();
  const tHSKAddress = await tHSK.getAddress();
  console.log("tHSK deployed to:", tHSKAddress);

  // -------------------------------------------------------------------------
  // 2. Deploy tUSDC
  // -------------------------------------------------------------------------
  console.log("\nDeploying tUSDC...");
  const tUSDC = await MockERC20.deploy("Test USDC", "tUSDC", 6, TUSDC_SUPPLY);
  await tUSDC.waitForDeployment();
  const tUSDCAddress = await tUSDC.getAddress();
  console.log("tUSDC deployed to:", tUSDCAddress);

  // -------------------------------------------------------------------------
  // 3. Seed GriffinDEX pool (if DEX address is provided)
  // -------------------------------------------------------------------------
  if (!DEX_ADDRESS) {
    console.log("\nGRIFFIN_DEX_ADDRESS not set — skipping pool creation.");
    console.log("Set it and re-run to seed the pool.");
  } else {
    console.log("\nSeeding GriffinDEX pool at", DEX_ADDRESS, "...");

    const dex = await ethers.getContractAt("GriffinDEX", DEX_ADDRESS);

    // Create pool
    const createTx = await dex.createPool(tHSKAddress, tUSDCAddress);
    await createTx.wait();
    console.log("Pool created");

    // Approve DEX to spend deployer's tokens
    await (await tHSK.approve(DEX_ADDRESS, POOL_THSK)).wait();
    await (await tUSDC.approve(DEX_ADDRESS, POOL_TUSDC)).wait();
    console.log("Approvals done");

    // Add liquidity
    const liquidityTx = await dex.addLiquidity(
      tHSKAddress,
      tUSDCAddress,
      POOL_THSK,
      POOL_TUSDC,
    );
    await liquidityTx.wait();
    console.log("Liquidity added: 10,000 tHSK / 10,000 tUSDC");
  }

  // -------------------------------------------------------------------------
  // 4. Print summary
  // -------------------------------------------------------------------------
  console.log("\n========================================");
  console.log("Add these to your orchestrator .env:");
  console.log("========================================");
  console.log(`THSK_TOKEN_ADDRESS=${tHSKAddress}`);
  console.log(`TUSDC_TOKEN_ADDRESS=${tUSDCAddress}`);
  console.log("\nAnd register them in ChainService.ts:");
  console.log(`{ address: "${tHSKAddress}", symbol: "tHSK", name: "Test HSK", decimals: 18, chainId: "eip155:133" }`);
  console.log(`{ address: "${tUSDCAddress}", symbol: "tUSDC", name: "Test USDC", decimals: 6, chainId: "eip155:133" }`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
