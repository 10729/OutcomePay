// OutcomePay test: hold $300, then capture only the earned share.
// Run: npm run partial

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createHash } from "node:crypto";
import {
  createHoldOrder,
  getOrder,
  authorizeOrder,
  captureAuthorization,
  getAuthorization,
} from "../lib/paypal/orders";

const rl = createInterface({ input, output });
const HOLD = 300;

async function main() {
  console.log("\n=== OutcomePay partial-capture test (PayPal SANDBOX, fake money) ===\n");

  const contractHash = createHash("sha256").update("outcome-contract: homepage LCP <= 2.5s").digest("hex");

  const { orderId, approveUrl } = await createHoldOrder({
    amount: HOLD.toFixed(2),
    description: "OutcomePay: homepage speed fix, pay only if it works",
    proofHash: contractHash,
    returnUrl: "https://example.com/outcomepay/return",
    cancelUrl: "https://example.com/outcomepay/cancel",
  });

  console.log(`1) Order created: ${orderId}`);
  console.log(`\n   OPEN THIS LINK, log in as the SANDBOX BUYER and approve:\n   ${approveUrl}\n`);
  await rl.question("   Press ENTER after you have approved... ");

  const order = await getOrder(orderId);
  if (order.status !== "APPROVED") {
    console.log(`\n   Order status is ${order.status}, not APPROVED. Approve it first, then run again.`);
    return;
  }

  const { authorizationId } = await authorizeOrder(orderId);
  console.log(`\n2) $${HOLD} HELD. Authorization ${authorizationId}`);

  const answer = (await rl.question("\n   Verified result: what % did the seller earn? (e.g. 60): ")).trim();
  const pct = Math.max(0, Math.min(100, Number(answer)));
  if (!Number.isFinite(pct)) {
    console.log("   Not a number. Run again.");
    return;
  }

  const earned = Math.floor(HOLD * pct) / 100; // round down to the cent
  console.log(`\n3) Decision: ${pct}% earned -> capture $${earned.toFixed(2)}, release $${(HOLD - earned).toFixed(2)}`);

  if (earned === 0) {
    console.log("   0% earned: run the void path (npm run money -> C) instead.");
    return;
  }

  const { captureId, status, captured } = await captureAuthorization(authorizationId, {
    value: earned.toFixed(2),
    currency: "USD",
  });
  console.log(`4) CAPTURED $${captured ?? earned.toFixed(2)} to the seller. Capture ${captureId} (${status})`);

  const auth = await getAuthorization(authorizationId);
  console.log(`5) Authorization status now: ${auth.status}  (expect PARTIALLY_CAPTURED or CAPTURED; remainder released)`);

  console.log("\nDone. Check the buyer and seller at sandbox.paypal.com to confirm only the earned share moved.\n");
}

main()
  .catch((err) => {
    console.error("\nSomething failed:\n", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
