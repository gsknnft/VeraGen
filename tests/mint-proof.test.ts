import { it, expect } from "vitest";
import { verifyMintTx, type Rpc } from "../lib/mint-proof";

const CONTRACT = "0x2222222222222222222222222222222222222222";
const OTHER_CONTRACT = "0x3333333333333333333333333333333333333333";
const MINTER = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x4444444444444444444444444444444444444444";
const TX = "0x" + "ab".repeat(32);
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topic = (hex: string) => "0x" + hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");

const mintLog = (to: string, tokenId: number, address = CONTRACT, from = "0x0") =>
  ({ address, topics: [TRANSFER, topic(from), topic(to), topic(tokenId.toString(16))] });

function chain(over: { status?: string; logs?: unknown[]; value?: string; head?: number; block?: number | null } = {}): Rpc {
  return async (method) => {
    if (method === "eth_getTransactionReceipt") {
      return over.block === null ? null : { status: over.status ?? "0x1", blockNumber: "0x" + (over.block ?? 100).toString(16), logs: over.logs ?? [mintLog(MINTER, 42)] };
    }
    if (method === "eth_blockNumber") return "0x" + (over.head ?? 110).toString(16);
    if (method === "eth_getTransactionByHash") return { value: over.value ?? "0x0" };
    throw new Error("unexpected " + method);
  };
}
const verify = (rpc: Rpc, extra: Partial<Parameters<typeof verifyMintTx>[0]> = {}) =>
  verifyMintTx({ rpc, contract: CONTRACT, txHash: TX, minters: [MINTER], ...extra });

it("accepts a confirmed mint from this contract to a linked wallet", async () => {
  expect(await verify(chain())).toEqual({ ok: true, minter: MINTER, tokenIds: ["42"], valueWei: 0n });
});

it("refuses mints that went to a wallet the claimant hasn't linked", async () => {
  expect(await verify(chain({ logs: [mintLog(STRANGER, 42)] }))).toMatchObject({ ok: false, error: expect.stringMatching(/haven't linked/) });
});

it("refuses tokens minted by a different contract, and plain transfers", async () => {
  expect(await verify(chain({ logs: [mintLog(MINTER, 42, OTHER_CONTRACT)] }))).toMatchObject({ ok: false, error: expect.stringMatching(/didn't mint from this collection/) });
  // A transfer between holders is not a mint.
  expect(await verify(chain({ logs: [mintLog(MINTER, 42, CONTRACT, STRANGER)] }))).toMatchObject({ ok: false });
});

it("ignores ERC-20 transfers, which have no indexed token id", async () => {
  const erc20 = { address: CONTRACT, topics: [TRANSFER, topic("0x0"), topic(MINTER)] };
  expect(await verify(chain({ logs: [erc20] }))).toMatchObject({ ok: false });
});

it("refuses failed, pending and under-confirmed transactions", async () => {
  expect(await verify(chain({ status: "0x0" }))).toMatchObject({ ok: false, error: expect.stringMatching(/failed/) });
  expect(await verify(chain({ block: null }))).toMatchObject({ ok: false, error: expect.stringMatching(/isn't confirmed/) });
  expect(await verify(chain({ block: 109, head: 110 }))).toMatchObject({ ok: false, error: expect.stringMatching(/confirmations/) });
  expect(await verify(chain({ block: 108, head: 110 }))).toMatchObject({ ok: true });
});

it("requires the mint price per token minted in the transaction", async () => {
  const twoMints = [mintLog(MINTER, 1), mintLog(STRANGER, 2)];
  // 2 tokens × 0.01 ETH = 0.02 ETH required; 0.015 paid.
  expect(await verify(chain({ logs: twoMints, value: "0x" + (15n * 10n ** 15n).toString(16) }), { minValueWei: (10n ** 16n).toString() }))
    .toMatchObject({ ok: false, error: expect.stringMatching(/mint price/) });
  expect(await verify(chain({ logs: twoMints, value: "0x" + (2n * 10n ** 16n).toString(16) }), { minValueWei: (10n ** 16n).toString() }))
    .toMatchObject({ ok: true, tokenIds: ["1"] });
});

it("rejects malformed input before touching the chain", async () => {
  const noCalls: Rpc = async () => { throw new Error("should not be called"); };
  expect(await verify(noCalls, { txHash: "0x1234" })).toMatchObject({ ok: false });
  expect(await verify(noCalls, { minters: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/Link the wallet/) });
  expect(await verify(noCalls, { contract: "0xnope" })).toMatchObject({ ok: false });
});
