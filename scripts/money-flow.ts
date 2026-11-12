// ProofPay money-flow test: hold -> release, or hold -> cancel, or hold -> release -> refund.
// Run: npm run money

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
  voidAuthorization,
  refundCapture,
} from "../lib/paypal/orders";

const rl = createInterface({ input, output });

async function main() {
  console.log("\n=== ProofPay money-flow test (PayPal SANDBOX, fake money) ===\n");

  // A stand-in for the real signed Proof of Human Intent.
  const proofHash = createHash("sha256").update("demo cart: Sony WH-CH720N, $89.00").digest("hex");

  const { orderId, approveUrl } = await createHoldOrder({
    amount: "89.00",
    description: "Sony WH-CH720N headphones (agent purchase)",
    proofHash,
    returnUrl: "https://example.com/proofpay/return",
    cancelUrl: "https://example.com/proofpay/cancel",
  });

  console.log(`1) Order created: ${orderId}`);
  console.log(`\n   OPEN THIS LINK in your browser, log in as the SANDBOX BUYER (Personal) and approve:\n   ${approveUrl}\n`);
  await rl.question("   Press ENTER after you have approved... ");

  const order = await getOrder(orderId);
  if (order.status !== "APPROVED") {
    console.log(`\n   Order status is ${order.status}, not APPROVED. Approve it first, then run again.`);
    return;
  }
  console.log(`\n2) Buyer approved. Proof hash stored in order: ${order.purchase_units?.[0]?.custom_id?.slice(0, 16)}...`);

  const { authorizationId, expiresAt } = await authorizeOrder(orderId);
  console.log(`3) MONEY HELD in the locker. Authorization ${authorizationId} (valid until ${expiresAt})`);

  const choice = (await rl.question("\n   Proof OK? Type R to RELEASE to seller, C to CANCEL the hold: ")).trim().toUpperCase();

  if (choice === "C") {
    await voidAuthorization(authorizationId);
    console.log("\n4) HOLD CANCELLED. Buyer was never charged.\n");
    return;
  }

  const { captureId } = await captureAuthorization(authorizationId);
  console.log(`\n4) RELEASED. Seller paid. Capture ${captureId}`);

  const refund = (await rl.question("\n   Simulate wrong item delivered and REFUND? (y/n): ")).trim().toLowerCase();
  if (refund === "y") {
    const { refundId, status } = await refundCapture(captureId, "ProofPay: delivered item did not match the approved order.");
    console.log(`\n5) REFUNDED to buyer. Refund ${refundId} (${status})`);
  }

  console.log("\nDone. Check both sandbox accounts at sandbox.paypal.com to see the money move.\n");
}

main()
  .catch((err) => {
    console.error("\nSomething failed:\n", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
