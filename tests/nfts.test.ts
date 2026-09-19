import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { listOwnedNfts, findOwnedNft, NftLookupError } from "../lib/nfts";

const OWNER = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0x2222222222222222222222222222222222222222";

const nft = (tokenId: string, over: Record<string, unknown> = {}) => ({
  contract: { address: CONTRACT, name: "BittyDragons" },
  tokenId,
  name: `Bitty #${tokenId}`,
  image: { cachedUrl: `https://nft-cdn.alchemy.com/eth-mainnet/${tokenId}`, pngUrl: `https://nft-cdn.alchemy.com/eth-mainnet/${tokenId}.png` },
  raw: { metadata: { attributes: [{ trait_type: "Element", value: "Ember" }, { trait_type: "Level", value: 3 }], image: "https://attacker.example/steal" } },
  ...over,
});

let calls: URL[] = [];
function respond(pages: Array<{ ownedNfts: unknown[]; pageKey?: string }> | { status: number }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    if (!Array.isArray(pages)) return new Response("nope", { status: pages.status });
    const page = pages[Number(url.searchParams.get("pageKey") ?? 0)];
    return Response.json(page);
  }));
}

beforeEach(() => { process.env.ALCHEMY_API_KEY = "test-key"; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ALCHEMY_API_KEY; });

it("normalizes tokens: cached PNG image, parsed traits, never the metadata's own image URL", async () => {
  respond([{ ownedNfts: [nft("7")] }]);
  const { nfts, truncated } = await listOwnedNfts(OWNER, "ethereum");
  expect(truncated).toBe(false);
  expect(nfts).toEqual([{
    network: "ethereum",
    contract: CONTRACT,
    tokenId: "7",
    name: "Bitty #7",
    collectionName: "BittyDragons",
    imageUrl: "https://nft-cdn.alchemy.com/eth-mainnet/7.png",
    thumbnailUrl: "https://nft-cdn.alchemy.com/eth-mainnet/7",
    traits: [{ trait: "Element", value: "Ember" }, { trait: "Level", value: "3" }],
  }]);
  expect(JSON.stringify(nfts)).not.toContain("attacker.example");
  expect(calls[0].hostname).toBe("eth-mainnet.g.alchemy.com");
});

it("drops spam and malformed tokens", async () => {
  respond([{ ownedNfts: [
    nft("1", { contract: { address: CONTRACT, isSpam: true } }),
    nft("not-a-number"),
    nft("2", { contract: { address: "0xnot-an-address" } }),
    nft("3"),
  ] }]);
  const { nfts } = await listOwnedNfts(OWNER, "ethereum");
  expect(nfts.map(n => n.tokenId)).toEqual(["3"]);
});

it("an indexer failure is an error, never an empty wallet", async () => {
  respond({ status: 503 });
  await expect(listOwnedNfts(OWNER, "ethereum")).rejects.toBeInstanceOf(NftLookupError);
  delete process.env.ALCHEMY_API_KEY;
  await expect(listOwnedNfts(OWNER, "ethereum")).rejects.toThrow("isn't configured");
});

it("pages through results and reports when the cap truncated them", async () => {
  respond([0, 1, 2, 3, 4, 5].map(i => ({ ownedNfts: [nft(String(i))], pageKey: String(i + 1) })));
  const { nfts, truncated } = await listOwnedNfts(OWNER, "ethereum");
  expect(nfts).toHaveLength(5);
  expect(truncated).toBe(true);
});

it("re-verifies ownership of the exact token, across every linked wallet", async () => {
  respond([{ ownedNfts: [nft("5"), nft("9")] }]);
  expect((await findOwnedNft([OWNER], "ethereum", CONTRACT, "9"))?.tokenId).toBe("9");
  expect(calls[0].searchParams.getAll("contractAddresses[]")).toEqual([CONTRACT]);
  expect(await findOwnedNft([OWNER], "ethereum", CONTRACT, "404")).toBeNull();
});

it("rejects a malformed contract or token id without calling the indexer", async () => {
  respond([{ ownedNfts: [] }]);
  expect(await findOwnedNft([OWNER], "ethereum", "0xnope", "1")).toBeNull();
  expect(await findOwnedNft([OWNER], "ethereum", CONTRACT, "1; drop")).toBeNull();
  expect(calls).toHaveLength(0);
});
