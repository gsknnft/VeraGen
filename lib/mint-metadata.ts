/**
 * A mint, projected into token metadata.
 *
 * One row per trait option holds its art, its attribute value, its prompt
 * fragment and its lore, so the image, the metadata and the story cannot
 * drift apart: the layer that was composited IS the attribute that is
 * published IS the line of lore in the description.
 *
 * `image` and `animation_url` point at VeraGen's own media routes, which are
 * private and signed per viewer. That is right for a preview and wrong for a
 * token: real metadata must resolve for anyone, forever, so publishing a
 * collection means pinning the stills and videos somewhere immutable and
 * rewriting these two fields. Until that lane exists this is an export, not
 * a token URI, and `veragen.mediaIsPrivate` says so in the document itself.
 */

export type MetadataCategory = {
  name: string;
  kind: string;
  sortOrder: number;
};

export type MetadataTrait = {
  category: MetadataCategory;
  label: string;
  lore: string | null;
};

export type MintForMetadata = {
  mintNumber: number;
  imageUrl: string | null;
  videoUrl: string | null;
  dna: string | null;
  seed: string;
  walletAddress: string | null;
  txHash: string | null;
  createdAt: Date;
};

export type CollectionForMetadata = {
  name: string;
  description: string | null;
  externalUrl: string | null;
  chainNetwork: string | null;
  contractAddress: string | null;
};

export interface TokenMetadata {
  name: string;
  description: string;
  image: string | null;
  animation_url?: string;
  external_url?: string;
  attributes: { trait_type: string; value: string }[];
  veragen: {
    dna: string | null;
    seed: string;
    mintedAt: string;
    mediaIsPrivate: true;
    chain?: string;
    contract?: string;
    tokenId?: number;
    minter?: string;
    mintTx?: string;
  };
}

/** Absolute when a base URL is given: metadata that travels needs full URLs. */
const absolute = (base: string | undefined, path: string | null) =>
  path ? (base ? new URL(path, base).toString() : path) : null;

export function buildTokenMetadata(args: {
  collection: CollectionForMetadata;
  mint: MintForMetadata;
  traits: MetadataTrait[];
  baseUrl?: string;
}): TokenMetadata {
  const { collection, mint, traits, baseUrl } = args;
  // Layer order is reading order: background first, companion last.
  const ordered = [...traits].sort((a, b) => a.category.sortOrder - b.category.sortOrder);

  const lore = ordered.map(t => t.lore?.trim()).filter((l): l is string => !!l);
  const description = [collection.description?.trim(), ...lore].filter(Boolean).join("\n\n");

  const metadata: TokenMetadata = {
    name: `${collection.name} #${mint.mintNumber}`,
    description,
    image: absolute(baseUrl, mint.imageUrl),
    attributes: ordered.map(t => ({ trait_type: t.category.name, value: t.label })),
    veragen: {
      dna: mint.dna,
      seed: mint.seed,
      mintedAt: mint.createdAt.toISOString(),
      mediaIsPrivate: true,
    },
  };

  const animation = absolute(baseUrl, mint.videoUrl);
  if (animation) metadata.animation_url = animation;
  if (collection.externalUrl) metadata.external_url = collection.externalUrl;

  // Provenance only when the mint is actually anchored on-chain.
  if (collection.chainNetwork && collection.contractAddress && mint.txHash) {
    metadata.veragen.chain = collection.chainNetwork;
    metadata.veragen.contract = collection.contractAddress;
    metadata.veragen.tokenId = mint.mintNumber;
    metadata.veragen.mintTx = mint.txHash;
    if (mint.walletAddress) metadata.veragen.minter = mint.walletAddress;
  }
  return metadata;
}
