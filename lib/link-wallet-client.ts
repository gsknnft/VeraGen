"use client";

import { getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";

/**
 * Browser half of wallet linking (server half: lib/wallet-link.ts). Asks the
 * injected wallet for an account, fetches a nonce bound to this session,
 * builds the EIP-4361 message the server expects, has the wallet sign it
 * (a signature, not a transaction: no gas, no spending access), and submits.
 */
type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export class WalletLinkError extends Error {}

export async function linkWallet(onStatus?: (status: string) => void): Promise<string> {
  const eth = typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new WalletLinkError("No browser wallet found. Install one (e.g. MetaMask or Rabby) and reload.");
  try {
    onStatus?.("Waiting for your wallet…");
    const [account] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const chainId = parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);
    const start = await fetch("/api/wallet/nonce", { method: "POST" });
    const ticket = await start.json();
    if (!start.ok) throw new WalletLinkError(ticket.error ?? "Could not start linking.");
    const address = getAddress(account);
    const message = createSiweMessage({
      address, chainId, domain: ticket.domain, uri: ticket.uri, nonce: ticket.nonce,
      version: "1", statement: ticket.statement, issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    });
    onStatus?.("Sign the message in your wallet (no gas, no transaction)…");
    const signature = await eth.request({ method: "personal_sign", params: [message, address] });
    const link = await fetch("/api/wallet/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
    const linked = await link.json();
    if (!link.ok) throw new WalletLinkError(linked.error ?? "Could not link that wallet.");
    return linked.address as string;
  } catch (err) {
    if ((err as { code?: number }).code === 4001) throw new WalletLinkError("Signature cancelled.");
    if (err instanceof WalletLinkError) throw err;
    throw new WalletLinkError("Could not link that wallet.");
  }
}
