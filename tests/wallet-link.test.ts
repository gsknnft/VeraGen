import { it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { verifyLinkProof, LINK_STATEMENT } from "../lib/wallet-link";

const DOMAIN = "veragen.example";
const URI = "https://veragen.example";
const account = privateKeyToAccount(generatePrivateKey());
const now = new Date("2026-09-19T12:00:00Z");

function message(over: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  return createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: DOMAIN,
    uri: URI,
    nonce: "abcdefgh12345678",
    version: "1",
    statement: LINK_STATEMENT,
    issuedAt: new Date(now.getTime() - 30_000),
    expirationTime: new Date(now.getTime() + 5 * 60_000),
    ...over,
  });
}
const verify = async (msg: string, signature?: string) =>
  verifyLinkProof({ message: msg, signature: signature ?? (await account.signMessage({ message: msg })), domain: DOMAIN, uri: URI, now });

it("accepts a genuine proof and returns the checksummed address", async () => {
  const result = await verify(message());
  expect(result).toEqual({ ok: true, address: account.address, chainId: 1, nonce: "abcdefgh12345678" });
});

it("refuses a signature from a different wallet than the message claims", async () => {
  const other = privateKeyToAccount(generatePrivateKey());
  const msg = message();
  const result = await verify(msg, await other.signMessage({ message: msg }));
  expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/doesn't match/) });
});

it("refuses a proof collected by another site", async () => {
  expect(await verify(message({ domain: "evil.example" }))).toMatchObject({ ok: false });
  expect(await verify(message({ uri: "https://evil.example" }))).toMatchObject({ ok: false });
});

it("refuses a message that isn't the wallet-link statement", async () => {
  expect(await verify(message({ statement: "Claim your free airdrop" }))).toMatchObject({ ok: false, error: expect.stringMatching(/isn't VeraGen/) });
});

it("refuses stale and expired messages", async () => {
  expect(await verify(message({ issuedAt: new Date(now.getTime() - 60 * 60_000), expirationTime: undefined }))).toMatchObject({ ok: false });
  expect(await verify(message({ expirationTime: new Date(now.getTime() - 1000) }))).toMatchObject({ ok: false });
});

it("refuses a message tampered with after signing", async () => {
  const msg = message();
  const signature = await account.signMessage({ message: msg });
  expect(await verify(msg.replace("Chain ID: 1", "Chain ID: 8453"), signature)).toMatchObject({ ok: false });
});

it("rejects contract-wallet signatures clearly rather than half-supporting them", async () => {
  expect(await verify(message(), "0x" + "ab".repeat(100))).toMatchObject({ ok: false, error: expect.stringMatching(/Smart-contract wallets/) });
  expect(await verify(message(), "not-hex")).toMatchObject({ ok: false });
});
