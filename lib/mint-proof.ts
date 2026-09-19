import { getAddress, isAddress } from "viem";
import { NFT_NETWORKS, type NftNetwork } from "./nfts";

/**
 * Verify an on-chain mint before sponsoring a generation for it.
 *
 * What this proves, from the chain itself:
 *   - the transaction succeeded and has enough confirmations to survive a reorg
 *   - it minted (Transfer from the zero address) one or more ERC-721 tokens
 *     from EXACTLY this collection's contract
 *   - to a wallet the claimant has linked by signature — so the person
 *     claiming is the person who minted, not someone holding a tx hash
 *   - paying at least the collection's minimum per minted token
 *
 * What it does NOT prove: that part of the mint price reached a generation
 * escrow. That split is the collection contract's job and is auditable on
 * chain; VeraGen verifies the mint, not the contract's accounting.
 */

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x" + "0".repeat(64);
export const MIN_CONFIRMATIONS = 3;
const MAX_TOKENS_PER_CLAIM = 10;

export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

export function alchemyRpc(network: NftNetwork): Rpc {
  return async (method, params) => {
    const key = process.env.ALCHEMY_API_KEY;
    if (!key) throw new Error("Mint verification isn't configured on this server.");
    const response = await fetch(`https://${NFT_NETWORKS[network]}.g.alchemy.com/v2/${key}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new Error(`Chain lookup failed (${response.status}).`);
    const data = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (data.error) throw new Error("Chain lookup failed.");
    return data.result;
  };
}

export type MintProof =
  | { ok: true; minter: `0x${string}`; tokenIds: string[]; valueWei: bigint }
  | { ok: false; error: string };

type Log = { address?: string; topics?: string[] };
type Receipt = { status?: string; blockNumber?: string; logs?: Log[] } | null;
type Tx = { value?: string } | null;

export async function verifyMintTx(args: {
  rpc: Rpc;
  contract: string;
  txHash: string;
  minters: readonly string[];
  minValueWei?: string | null;
}): Promise<MintProof> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.txHash)) return { ok: false, error: "That isn't a transaction hash." };
  if (!isAddress(args.contract)) return { ok: false, error: "This collection's contract isn't configured." };
  const contract = getAddress(args.contract);
  const minters = new Set(args.minters.filter(a => isAddress(a)).map(a => getAddress(a)));
  if (minters.size === 0) return { ok: false, error: "Link the wallet you minted with first." };

  const receipt = (await args.rpc("eth_getTransactionReceipt", [args.txHash])) as Receipt;
  if (!receipt || !receipt.blockNumber) return { ok: false, error: "That transaction isn't confirmed yet. Try again in a minute." };
  if (receipt.status !== "0x1") return { ok: false, error: "That transaction failed on-chain." };

  const head = BigInt((await args.rpc("eth_blockNumber", [])) as string);
  if (head - BigInt(receipt.blockNumber) + 1n < BigInt(MIN_CONFIRMATIONS)) {
    return { ok: false, error: "That mint needs a few more confirmations. Try again in a minute." };
  }

  // ERC-721 Transfer has FOUR topics (tokenId indexed); ERC-20 has three.
  const mints = (receipt.logs ?? []).filter(l =>
    l.address && isAddress(l.address) && getAddress(l.address) === contract &&
    l.topics?.length === 4 && l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics[1]?.toLowerCase() === ZERO_TOPIC,
  ).map(l => ({ to: getAddress("0x" + l.topics![2]!.slice(26)), tokenId: BigInt(l.topics![3]!).toString() }));

  if (mints.length === 0) return { ok: false, error: "That transaction didn't mint from this collection." };
  const mine = mints.filter(m => minters.has(m.to));
  if (mine.length === 0) return { ok: false, error: "That mint went to a wallet you haven't linked. Link the minting wallet first." };
  if (mine.length > MAX_TOKENS_PER_CLAIM) return { ok: false, error: `That transaction minted more than ${MAX_TOKENS_PER_CLAIM} tokens; claim is limited per transaction.` };
  const owners = new Set(mine.map(m => m.to));
  if (owners.size > 1) return { ok: false, error: "That transaction minted to several of your wallets; claim from one at a time." };

  const tx = (await args.rpc("eth_getTransactionByHash", [args.txHash])) as Tx;
  const valueWei = BigInt(tx?.value ?? "0x0");
  if (args.minValueWei) {
    // Per token minted in the transaction, including any minted to others.
    const required = BigInt(args.minValueWei) * BigInt(mints.length);
    if (valueWei < required) return { ok: false, error: "That mint didn't pay the collection's mint price." };
  }
  return { ok: true, minter: [...owners][0]!, tokenIds: mine.map(m => m.tokenId), valueWei };
}
