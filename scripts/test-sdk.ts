import * as dotenv from "dotenv"

dotenv.config();

/**
 * End-to-end SDK smoke test.
 * Requires the orchestrator to be running locally on PORT 3000.
 *
 * Usage:
 *   npx tsx scripts/test-sdk.ts
 *
 * What it tests:
 *   1. Health check
 *   2. Supported chains
 *   3. Quote for tHSK → tUSDC
 *   4. Create intent (tHSK → tUSDC swap)
 *   5. Execute intent and poll until COMPLETED or FAILED
 */

import { GriffinClient, GriffinApiError } from "../packages/sdk/src/index";

const BASE_URL = process.env.GRIFFIN_URL || "http://localhost:3000";

// Token addresses from ChainService
const THSK  = "0xb8F355f10569FD2A765296161d082Cc37c5843c2";
const TUSDC = "0xc4C2841367016C9e2652Fecc49bBA9229787bA82";
const CHAIN = "eip155:133";

// Replace with your actual test wallet address and signature
const USER_ADDRESS = process.env.USER_ADDRESS || "0xB1655beD2370B9Ad33Dd4ab905a7923D29Ab6778";
const RECIPIENT    = process.env.RECIPIENT    || "0x345b10A79E9fC89F33AEf7a92E621a25cd100876";

const client = new GriffinClient({ baseUrl: BASE_URL });

function log(label: string, value: unknown) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function poll(intentId: string, maxAttempts = 15): Promise<void> {
  let last;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    last = await client.getIntent(intentId);
    console.log(`  [${i + 1}/${maxAttempts}] status: ${last.status}`);
    if (last.status === "completed" || last.status === "failed" || last.status === "cancelled") {
      break;
    }
  }
  log("Final intent state", last);
}

async function main() {
  console.log(`Connecting to Griffin orchestrator at ${BASE_URL}\n`);

  // 1. Health
  try {
    // const health = await client.getHealth();
    const res = await fetch(`${BASE_URL}/health`);
    const health = await res.json();
    log("Health", health);
  } catch (e) {
    console.error("Health check failed — is the orchestrator running?");
    process.exit(1);
  }

  // 2. Supported chains
  const chains = await client.getSupportedChains();
  log("Supported chains", chains);

  // 3. Quote
  try {
    const quote = await client.getQuote({
      fromChain: CHAIN,
      toChain: CHAIN,
      fromToken: THSK,
      toToken: TUSDC,
      amount: "1",
    });
    log("Quote (1 tHSK → tUSDC)", quote);
  } catch (e) {
    if (e instanceof GriffinApiError) {
      console.warn(`Quote failed (${e.code}): ${e.message} — continuing`);
    }
  }

  // 4. Create intent
  let intentId: string;
  console.log("Sender: ", USER_ADDRESS);
  console.log("Recipient: ", RECIPIENT);
  try {
    const intent = await client.createIntent({
      fromChain: CHAIN,
      toChain: CHAIN,
      fromToken: THSK,
      toToken: TUSDC,
      amount: "1",
      recipient: RECIPIENT,
      userAddress: USER_ADDRESS,
      requestMessage: "test payment from sdk script",
      requestSignature: "0x00", // placeholder — replace with real sig for full flow
    });
    log("Intent created", intent);
    intentId = intent.intentId;
  } catch (e) {
    if (e instanceof GriffinApiError) {
      console.error(`Create intent failed (${e.code}): ${e.message}`);
    }
    process.exit(1);
  }

  // 5. Execute and poll
  try {
    const executed = await client.executeIntent(intentId!);
    log("Execute triggered", executed);
    console.log("\nPolling for completion...");
    await poll(intentId!);
  } catch (e) {
    if (e instanceof GriffinApiError) {
      console.error(`Execute failed (${e.code}): ${e.message}`);
    }
  }
}

main().catch(console.error);
