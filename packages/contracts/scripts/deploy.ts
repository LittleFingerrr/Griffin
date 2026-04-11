import { ethers } from "hardhat";

async function main() {
  console.log("Deploying GriffinDEX to HashKey Chain...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const GriffinDEX = await ethers.getContractFactory("GriffinDEX");
  const dex = await GriffinDEX.deploy();

  await dex.waitForDeployment();
  const address = await dex.getAddress();

  console.log("GriffinDEX deployed to:", address);
  console.log("\nSave this address to your .env file:");
  console.log(`GRIFFIN_DEX_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
