import { randomUUID } from "node:crypto";
import { getAddress, recoverMessageAddress, isHex } from "viem";
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { prisma } from "./db";

/**
 * Link a wallet to the signed-in account by proof of control (EIP-4361).
 *
 * Why not better-auth's SIWE plugin: it is a SIGN-IN method. /siwe/verify
 * never consults the current session; it finds or creates a user by wallet.
 * A holder who signed in with Google would get a second, separate account the
 * moment they connected a wallet. This links instead.
 *
 * What the proof must satisfy, all server-side:
 *   - a nonce this server issued, to THIS account, unexpired, used once
 *   - our own domain (a signature collected by another site is not ours)
 *   - our fixed statement, so a user can't be tricked into signing a link
 *     while believing they are signing something else
 *   - issued recently and not expired
 *   - the signature recovers to exactly the address the message claims
 *
 * EOA signatures only. Smart-contract wallets (Safe, Coinbase Smart Wallet)
 * sign via ERC-1271, which needs an on-chain call to verify; they are refused
 * with a clear message rather than half-supported.
 */

export const LINK_STATEMENT = "Link this wallet to your VeraGen account. This does not grant spending access.";
export const NONCE_TTL_MS = 10 * 60 * 1000;
const identifier = (userId: string) => `wallet-link:${userId}`;

export function linkOrigin(): { domain: string; uri: string } {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("BETTER_AUTH_URL must be set to link wallets.");
  const url = new URL(base);
  return { domain: url.host, uri: url.origin };
}

export async function issueLinkNonce(userId: string) {
  const nonce = generateSiweNonce();
  await prisma.verification.create({
    data: { id: randomUUID(), identifier: identifier(userId), value: nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) },
  });
  return { nonce, statement: LINK_STATEMENT, ...linkOrigin() };
}

/** Single use: returns true only for the first caller that presents it. */
export async function consumeLinkNonce(userId: string, nonce: string) {
  const { count } = await prisma.verification.deleteMany({
    where: { identifier: identifier(userId), value: nonce, expiresAt: { gt: new Date() } },
  });
  return count === 1;
}

export type LinkProof =
  | { ok: true; address: `0x${string}`; chainId: number; nonce: string }
  | { ok: false; error: string };

/**
 * Check a signed link message. Pure apart from the clock, so it is tested with
 * real signatures. Does NOT consume the nonce — the caller does that for the
 * specific account, which is what binds the proof to that account.
 */
export async function verifyLinkProof(args: {
  message: unknown;
  signature: unknown;
  domain: string;
  uri: string;
  now?: Date;
}): Promise<LinkProof> {
  const now = args.now ?? new Date();
  if (typeof args.message !== "string" || args.message.length > 2000) return { ok: false, error: "Missing or oversized message." };
  if (typeof args.signature !== "string" || !isHex(args.signature)) return { ok: false, error: "Missing signature." };
  // 65 bytes = an EOA signature. Anything else is a contract-wallet format.
  if (args.signature.length !== 132) return { ok: false, error: "Only standard wallet signatures are supported. Smart-contract wallets can't be linked yet." };

  const parsed = parseSiweMessage(args.message);
  if (!parsed.address || !parsed.nonce || !parsed.chainId || !parsed.issuedAt) return { ok: false, error: "That isn't a complete sign-in message." };
  if (parsed.statement !== LINK_STATEMENT) return { ok: false, error: "The signed message isn't VeraGen's wallet-link message." };
  if (parsed.uri !== args.uri) return { ok: false, error: "The signed message is for a different site." };
  if (!validateSiweMessage({ message: parsed, domain: args.domain, time: now })) {
    return { ok: false, error: "The signed message is for a different site, or has expired." };
  }
  const age = now.getTime() - parsed.issuedAt.getTime();
  if (age > NONCE_TTL_MS || age < -60_000) return { ok: false, error: "The signed message has expired. Try linking again." };

  let signer: `0x${string}`;
  try {
    signer = await recoverMessageAddress({ message: args.message, signature: args.signature });
  } catch {
    return { ok: false, error: "The signature could not be verified." };
  }
  if (getAddress(signer) !== getAddress(parsed.address)) return { ok: false, error: "The signature doesn't match the wallet in the message." };
  return { ok: true, address: getAddress(parsed.address), chainId: parsed.chainId, nonce: parsed.nonce };
}
