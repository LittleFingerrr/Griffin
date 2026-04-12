import { ethers } from "hardhat";

async function main() {
  try {
    const [deployer] = await ethers.getSigners();
    
    if (!deployer) {
      console.error("❌ No account found!");
      console.error("Make sure PRIVATE_KEY is set in your .env file");
      process.exit(1);
    }

    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("Account:", deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "HSK");
    
    if (balance === 0n) {
      console.log("\n⚠️  Warning: Account has no HSK tokens!");
      console.log("Get testnet HSK from: https://faucet.hsk.xyz/");
    } else {
      console.log("\n✓ Account has sufficient balance for deployment");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error("\nMake sure:");
    console.error("1. PRIVATE_KEY is set in packages/contracts/.env");
    console.error("2. Private key is valid (64 hex characters, no 0x prefix)");
    console.error("3. You're connected to the internet");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
