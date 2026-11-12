# OutcomePay

**Pay only if it works.** A seller makes a promise, AI turns it into a measurable contract, PayPal holds the buyer's money, independent checks measure the result, and deterministic code captures exactly the share that was earned. The rest goes back to the buyer.

Built for the PayPal AI Hackathon 2026. Runs entirely on the PayPal **sandbox** with test money.

## What it does

| Feature | What happens | PayPal | AI |
| --- | --- | --- | --- |
| Promise → contract | Plain English becomes a schema-checked Outcome Contract: metric, payout curve, anti-cheating checks, or a photo checklist | — | Gemini extracts intent; code builds the contract |
| Hold | Buyer pays with the PayPal button; the contract's SHA-256 is stored in the order | JS SDK, Orders v2 `intent: AUTHORIZE` | — |
| Website speed jobs | Before/after mobile load test (Google PageSpeed on public URLs), plus checks that checkout still works and content wasn't deleted | — | — |
| Photo-verified jobs | Checklist judged item by item from the seller's **and** the buyer's photos. The seller's photos alone can never release money; disagreement keeps the money held | — | Gemini vision |
| Live verification | Evidence streams onto the screen as each check finishes | — | — |
| Decision | Plain code applies guards and the payout curve. No AI decides money | — | — |
| Settlement | Full capture, **partial capture** of the earned share, or void. Fallback: full capture + partial refund | Capture, void, refund | — |
| Team payouts | The earned money is split among the team in one batch | **Payouts** | — |
| Disputes | Find PayPal disputes on a capture and answer with the evidence report | **Disputes** (provide-evidence) | Report writer |
| AI agent + passkey | An agent picks a seller by verified track record and drafts the contract; the buyer approves with a passkey whose challenge contains the contract hash | Then funded with the PayPal button | Gemini (agent) |
| Reputation | Sellers ranked by verified outcomes, not stars | — | — |
| Dashboard | Held vs paid vs returned, every job in an AG Grid table | Transaction results | — |
| Webhooks | Signature-verified PayPal events recorded on the matching job | Webhooks + verify-webhook-signature | — |

**Design principle:** AI proposes, evidence verifies, code decides, PayPal executes, the audit trail remembers.

## Run it (Windows: use `npm.cmd` if `npm` is blocked)

Requirements: Node.js 20+

```bash
npm install
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
npm run dev
```

Fill in `.env.local`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same as the client ID), and `GOOGLE_GENERATIVE_AI_API_KEY` (needed for photo verification; without it, a template contract writer and rule-based agent are used).

Sandbox setup:
- Pay with a sandbox **Personal** account (Testing Tools → Sandbox Accounts).
- For team payouts, enable **Payouts** on the sandbox app (Apps & Credentials → your app → Features).
- For disputes, log in to sandbox.paypal.com as the buyer, open a dispute on a captured payment, then use **Check for disputes** on the job page.

## Demo scripts

**Website speed** (New job → Website speed → Use the demo site): pay, then pick what the seller deploys and click Verify.

| Seller deploys | Result |
| --- | --- |
| Honest fix | 100% captured |
| Half-done fix | 60% captured, 40% released |
| Cheat: delete content | Content check fails, hold voided |
| Fix that breaks checkout | Checkout check fails, hold voided |
| Nothing changed | Still slow, hold voided |

On localhost, speed is timed directly; on a public URL, Google PageSpeed's mobile test is used.

**Photo-verified service** (New job → Photo-verified service): pay, then add photos.

| Photos | Result |
| --- | --- |
| Seller: honest photos + buyer's photo | Oven still dirty: 4 of 5 verified, 80% captured, team paid by Payouts |
| Seller: claims all done + buyer's photo | Photos disagree on the oven: money stays held until the buyer chooses |
| Seller photos only | Money stays held: self-submitted evidence can't release money |

Demo photos are labelled illustrations; real photos can be uploaded.

**Agent** (Agent page): ask the agent, set up a passkey once, approve with your fingerprint, then fund with PayPal.

Terminal tests of the money engine: `npm run money`, `npm run partial`.

## AI used

| Component | Model | Role |
| --- | --- | --- |
| Contract writer | Google Gemini (`GEMINI_MODEL`, default `gemini-flash-latest`) via Vercel AI SDK | Extracts targets, checklist items and gaming risks; code builds and validates the contract |
| Vision verifier | Same | Judges each checklist item from one side's photos, with confidence and an observation |
| Purchasing agent | Same | Chooses a seller from verified track records and writes the promise |
| Report writer | Same | Explains the decision; cannot change it |

## Boundaries

- PayPal authorize/capture is a **hold, not legal escrow**. Holds are honoured for 3 days and valid up to 29.
- OutcomePay supplies evidence to PayPal disputes; PayPal decides them.
- A seller's own photos or claims are never treated as independent proof.
- Seller reputation includes clearly labelled seeded demo history.
- Sandbox prototype only.

## License

MIT
