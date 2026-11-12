// Passkeys (WebAuthn): the human approves with fingerprint / Face ID / device PIN.
// The approval challenge contains the contract hash, so the signature covers the exact contract.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import {
  addPasskey,
  getPasskeys,
  getRegChallenge,
  setRegChallenge,
  updatePasskeyCounter,
} from "./store";

export function relyingParty(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => {
  const buf = Buffer.from(s, "base64url");
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
};

export async function registrationOptions(req: Request) {
  const { rpID } = relyingParty(req);
  const existing = await getPasskeys();
  const options = await generateRegistrationOptions({
    rpName: "OutcomePay",
    rpID,
    userName: "demo-buyer",
    userDisplayName: "OutcomePay demo buyer",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await setRegChallenge(options.challenge);
  return options;
}

export async function verifyRegistration(req: Request, response: RegistrationResponseJSON) {
  const { rpID, origin } = relyingParty(req);
  const expectedChallenge = await getRegChallenge();
  if (!expectedChallenge) throw new Error("No registration in progress.");
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  await setRegChallenge(undefined);
  if (!result.verified || !result.registrationInfo) throw new Error("Passkey registration could not be verified.");
  const c = result.registrationInfo.credential;
  await addPasskey({ id: c.id, publicKey: b64u(c.publicKey), counter: c.counter, transports: c.transports, createdAt: new Date().toISOString() });
  return { credentialId: c.id };
}

// Challenge = "<contract hash>.<nonce>", so the authenticator signs over the contract hash.
export async function approvalOptions(req: Request, contractHash: string) {
  const { rpID } = relyingParty(req);
  const keys = await getPasskeys();
  if (!keys.length) throw new Error("No passkey registered yet.");
  const text = `${contractHash}.${randomBytes(8).toString("hex")}`;
  const challenge = new Uint8Array(new ArrayBuffer(text.length));
  challenge.set(new TextEncoder().encode(text));
  return generateAuthenticationOptions({
    rpID,
    challenge,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as never })),
  });
}

export async function verifyApproval(req: Request, response: AuthenticationResponseJSON, expectedChallenge: string, contractHash: string) {
  const { rpID, origin } = relyingParty(req);
  const key = (await getPasskeys()).find((k) => k.id === response.id);
  if (!key) throw new Error("Unknown passkey.");
  const signed = Buffer.from(expectedChallenge, "base64url").toString("utf8");
  if (!signed.startsWith(`${contractHash}.`)) throw new Error("Challenge does not match this contract.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: key.id, publicKey: fromB64u(key.publicKey), counter: key.counter, transports: key.transports as never },
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error("Passkey approval could not be verified.");
  await updatePasskeyCounter(key.id, result.authenticationInfo.newCounter);
  return { credentialId: key.id, signed };
}
