import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

/**
 * Approves GriffinDEX to spend Griffin's vault tokens.
 * Must be run before any swap can execute.
 *
 * Run:
 *   npx hardhat run scripts/approveTokens.ts --network hashkey
 */

const DEX_ADDRESS    = process.env.GRIFFIN_DEX_ADDRESS || "";
const THSK_ADDRESS   = "0xb8F355f10569FD2A765296161d082Cc37c5843c2";
const TUSDC_ADDRESS  = "0xc4C2841367016C9e2652Fecc49bBA9229787bA82";

const MAX_UINT256 = ethers.MaxUint256;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Approving from:", signer.address);
  console.log("DEX address:   ", DEX_ADDRESS);

  const tHSK  = new ethers.Contract(THSK_ADDRESS,  ERC20_ABI, signer);
  const tUSDC = new ethers.Contract(TUSDC_ADDRESS, ERC20_ABI, signer);

  console.log("\nApproving tHSK...");
  const tx1 = await tHSK.approve(DEX_ADDRESS, MAX_UINT256);
  await tx1.wait();
  console.log("tHSK approved:", tx1.hash);

  console.log("\nApproving tUSDC...");
  const tx2 = await tUSDC.approve(DEX_ADDRESS, MAX_UINT256);
  await tx2.wait();
  console.log("tUSDC approved:", tx2.hash);

  // Verify
  const allowanceHSK  = await tHSK.allowance(signer.address, DEX_ADDRESS);
  const allowanceUSDC = await tUSDC.allowance(signer.address, DEX_ADDRESS);
  console.log("\nAllowances confirmed:");
  console.log("  tHSK: ", allowanceHSK.toString());
  console.log("  tUSDC:", allowanceUSDC.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
