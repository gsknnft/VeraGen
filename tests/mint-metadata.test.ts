import { it, expect } from "vitest";
import { buildTokenMetadata } from "../lib/mint-metadata";

const collection = {
  name: "BittyDragons",
  description: "Hatched from the first forge.",
  externalUrl: "https://bittyverse.example",
  chainNetwork: "ethereum",
  contractAddress: "0x2222222222222222222222222222222222222222",
};
const mint = {
  mintNumber: 7,
  imageUrl: "/api/media/img7",
  videoUrl: "/api/media/vid7",
  dna: "abc123",
  seed: "collection:7:0xtx",
  walletAddress: "0x1111111111111111111111111111111111111111",
  txHash: "0xtx",
  createdAt: new Date("2026-09-25T10:00:00Z"),
};
// Deliberately out of order: reading order must come from sortOrder.
const traits = [
  { category: { name: "Skin", kind: "skin", sortOrder: 1 }, label: "Ember", lore: "Born of the first forge." },
  { category: { name: "Background", kind: "background", sortOrder: 0 }, label: "Duskmire", lore: null },
  { category: { name: "Companion", kind: "companion", sortOrder: 3 }, label: "Ash Sprite", lore: "It followed her home." },
];

it("publishes attributes in layer order, from the same rows that supplied the art", () => {
  const meta = buildTokenMetadata({ collection, mint, traits, baseUrl: "https://veragen.example" });
  expect(meta.name).toBe("BittyDragons #7");
  expect(meta.attributes).toEqual([
    { trait_type: "Background", value: "Duskmire" },
    { trait_type: "Skin", value: "Ember" },
    { trait_type: "Companion", value: "Ash Sprite" },
  ]);
});

it("builds the description from collection lore then trait lore, skipping traits without any", () => {
  const meta = buildTokenMetadata({ collection, mint, traits });
  expect(meta.description).toBe("Hatched from the first forge.\n\nBorn of the first forge.\n\nIt followed her home.");
});

it("makes media absolute when a base URL is given, and flags that it is private", () => {
  const meta = buildTokenMetadata({ collection, mint, traits, baseUrl: "https://veragen.example" });
  expect(meta.image).toBe("https://veragen.example/api/media/img7");
  expect(meta.animation_url).toBe("https://veragen.example/api/media/vid7");
  expect(meta.external_url).toBe("https://bittyverse.example");
  // Honest in the document itself: these URLs are signed per viewer, so this
  // is an export, not something to publish as a token URI.
  expect(meta.veragen.mediaIsPrivate).toBe(true);
});

it("omits animation_url until the video exists", () => {
  const meta = buildTokenMetadata({ collection, mint: { ...mint, videoUrl: null }, traits });
  expect(meta.animation_url).toBeUndefined();
  expect(meta.image).toBe("/api/media/img7");
});

it("records chain provenance only for a mint actually anchored on-chain", () => {
  const anchored = buildTokenMetadata({ collection, mint, traits }).veragen;
  expect(anchored).toMatchObject({ chain: "ethereum", contract: collection.contractAddress, tokenId: 7, mintTx: "0xtx", minter: mint.walletAddress });

  const offchain = buildTokenMetadata({ collection, mint: { ...mint, txHash: null }, traits }).veragen;
  expect(offchain.chain).toBeUndefined();
  expect(offchain.mintTx).toBeUndefined();
  // The roll is still recorded: reproducibility does not depend on a chain.
  expect(offchain).toMatchObject({ dna: "abc123", seed: "collection:7:0xtx" });
});
