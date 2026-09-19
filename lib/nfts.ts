import { getAddress, isAddress } from "viem";

/**
 * Owned-NFT lookup via Alchemy's NFT API v3.
 *
 * Ported from sigilnet/app/lib/lib/alchemy/getNFTs.ts, fixing what that did:
 *   - the key was NEXT_PUBLIC_ (shipped to every browser); here it is
 *     server-only ALCHEMY_API_KEY
 *   - it defaulted to Goerli, a testnet that no longer exists
 *   - any error ended the loop and returned a partial list as if complete;
 *     here errors are raised, so "you own nothing" and "lookup failed" can
 *     never look the same
 *   - v2 endpoints, now deprecated
 */

export const NFT_NETWORKS = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  polygon: "polygon-mainnet",
  arbitrum: "arb-mainnet",
  optimism: "opt-mainnet",
} as const;
export type NftNetwork = keyof typeof NFT_NETWORKS;
export const isNftNetwork = (value: unknown): value is NftNetwork => typeof value === "string" && value in NFT_NETWORKS;

export interface OwnedNft {
  network: NftNetwork;
  contract: `0x${string}`;
  tokenId: string;
  name: string;
  collectionName: string | null;
  /** The indexer's cached image — the only image URL VeraGen will ever fetch. */
  imageUrl: string | null;
  thumbnailUrl: string | null;
  traits: { trait: string; value: string }[];
}

export class NftLookupError extends Error {}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const TOKEN_ID = /^\d{1,78}$/;

function apiBase(network: NftNetwork) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new NftLookupError("NFT lookup isn't configured on this server.");
  return `https://${NFT_NETWORKS[network]}.g.alchemy.com/nft/v3/${key}`;
}

type RawNft = {
  contract?: { address?: string; name?: string; isSpam?: boolean; openSeaMetadata?: { collectionName?: string } };
  tokenId?: string;
  name?: string;
  image?: { cachedUrl?: string; pngUrl?: string; thumbnailUrl?: string };
  raw?: { metadata?: { attributes?: unknown } };
  collection?: { name?: string };
};

function normalize(raw: RawNft, network: NftNetwork): OwnedNft | null {
  const address = raw.contract?.address;
  if (!address || !isAddress(address) || !raw.tokenId || !TOKEN_ID.test(raw.tokenId)) return null;
  if (raw.contract?.isSpam) return null;
  const attributes = Array.isArray(raw.raw?.metadata?.attributes) ? raw.raw!.metadata!.attributes as unknown[] : [];
  const traits = attributes.flatMap(a => {
    if (!a || typeof a !== "object") return [];
    const { trait_type, value } = a as { trait_type?: unknown; value?: unknown };
    if (typeof trait_type !== "string" || (typeof value !== "string" && typeof value !== "number")) return [];
    return [{ trait: trait_type.slice(0, 60), value: String(value).slice(0, 120) }];
  }).slice(0, 30);
  const collectionName = raw.collection?.name ?? raw.contract?.openSeaMetadata?.collectionName ?? raw.contract?.name ?? null;
  return {
    network,
    contract: getAddress(address),
    tokenId: raw.tokenId,
    name: (raw.name?.trim() || `${collectionName ?? "Token"} #${raw.tokenId}`).slice(0, 120),
    collectionName,
    // PNG first: SVG-based NFTs get a rasterized copy, which the image
    // pipeline can read.
    imageUrl: raw.image?.pngUrl ?? raw.image?.cachedUrl ?? null,
    thumbnailUrl: raw.image?.thumbnailUrl ?? raw.image?.cachedUrl ?? null,
    traits,
  };
}

async function ownedPage(network: NftNetwork, owner: string, pageKey?: string, contract?: string) {
  const params = new URLSearchParams({ owner, withMetadata: "true", pageSize: String(PAGE_SIZE) });
  if (pageKey) params.set("pageKey", pageKey);
  if (contract) params.append("contractAddresses[]", contract);
  const response = await fetch(`${apiBase(network)}/getNFTsForOwner?${params}`, {
    redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!response.ok) throw new NftLookupError(`NFT lookup failed (${response.status}). Try again shortly.`);
  return response.json() as Promise<{ ownedNfts?: RawNft[]; pageKey?: string }>;
}

/** Every NFT an address owns on one network, up to a cap. `truncated` says when the cap was hit. */
export async function listOwnedNfts(owner: string, network: NftNetwork) {
  if (!isAddress(owner)) throw new NftLookupError("Invalid wallet address.");
  const nfts: OwnedNft[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await ownedPage(network, getAddress(owner), pageKey);
    for (const raw of data.ownedNfts ?? []) {
      const nft = normalize(raw, network);
      if (nft) nfts.push(nft);
    }
    pageKey = data.pageKey;
    if (!pageKey) return { nfts, truncated: false };
  }
  return { nfts, truncated: true };
}

/**
 * Re-verify, server-side, that one of these wallets owns this exact token
 * right now — never trusting the client's word or an earlier listing, since
 * NFTs move. Returns the token as the indexer sees it, or null.
 */
export async function findOwnedNft(owners: readonly string[], network: NftNetwork, contract: string, tokenId: string) {
  if (!isAddress(contract) || !TOKEN_ID.test(tokenId)) return null;
  for (const owner of owners) {
    let pageKey: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await ownedPage(network, getAddress(owner), pageKey, getAddress(contract));
      const hit = (data.ownedNfts ?? []).find(n => n.tokenId === tokenId);
      if (hit) return normalize(hit, network);
      pageKey = data.pageKey;
      if (!pageKey) break;
    }
  }
  return null;
}
