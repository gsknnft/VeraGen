"use client";

import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";

export interface ClaimConfig {
  chainNetwork: string | null;
  contractAddress: string | null;
  sponsoredPerDay: number;
  mintMinValueWei: string | null;
}

const NETWORKS = ["ethereum", "base", "polygon", "arbitrum", "optimism"];

/**
 * Owner settings for mint-funded generation: which contract's mints count,
 * the minimum each mint must pay, and how many sponsored generations holders
 * can draw per day. The claim link is what the owner shares with minters.
 */
export function ClaimSettings({ collectionId, initial }: { collectionId: string; initial: ClaimConfig }) {
  const [network, setNetwork] = useState(initial.chainNetwork ?? "ethereum");
  const [contract, setContract] = useState(initial.contractAddress ?? "");
  const [perDay, setPerDay] = useState(initial.sponsoredPerDay);
  const [minEth, setMinEth] = useState(initial.mintMinValueWei ? formatEther(BigInt(initial.mintMinValueWei)) : "");
  const [saved, setSaved] = useState<ClaimConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = saved.sponsoredPerDay > 0 && !!saved.contractAddress && !!saved.chainNetwork;
  // Filled in after mount: the server has no window, and rendering the origin
  // there and not here would make the HTML disagree (a hydration error).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const claimUrl = `${origin}/claim/${collectionId}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let mintMinValueWei: string | null = null;
    try {
      mintMinValueWei = minEth.trim() ? parseEther(minEth.trim()).toString() : null;
    } catch {
      return setError("Minimum mint price must be a number, in the network's native token (e.g. 0.01).");
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainNetwork: network, contractAddress: contract.trim() || null, sponsoredPerDay: perDay, mintMinValueWei }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setSaved({ chainNetwork: data.chainNetwork, contractAddress: data.contractAddress, sponsoredPerDay: data.sponsoredPerDay, mintMinValueWei: data.mintMinValueWei });
      if (data.contractAddress) setContract(data.contractAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally { setBusy(false); }
  }

  return (
    <form className="character-form" onSubmit={save}>
      <strong>Holder claims — mint-funded videos</strong>
      <p className="hint">
        Holders who mint on your contract claim a video of their token, animated from its layers, paid from the
        sponsored allowance instead of their own account. VeraGen checks on-chain that each claim is a real mint from
        this contract to the claimant&apos;s own wallet, paying at least the minimum below. Routing part of the mint price
        to cover generation is your contract&apos;s job.
      </p>
      <div className="trim-row">
        <label>
          Network
          <select value={network} onChange={e => setNetwork(e.target.value)}>
            {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Sponsored videos / day
          <input type="number" min={0} max={10000} value={perDay} onChange={e => setPerDay(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
        </label>
      </div>
      <label>
        NFT contract address
        <input type="text" placeholder="0x…" value={contract} onChange={e => setContract(e.target.value)} spellCheck={false} />
      </label>
      <label>
        Minimum mint price (native token, per token; blank = any)
        <input type="text" placeholder="0.01" value={minEth} onChange={e => setMinEth(e.target.value)} />
      </label>
      <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save claim settings"}</button>
      {error && <p className="error">{error}</p>}
      {live ? (
        <p className="hint">Claims are live. Share this link with minters: <a href={`/claim/${collectionId}`}>{claimUrl}</a></p>
      ) : (
        <p className="hint">Claims are off. Set a contract and at least 1 sponsored video per day to turn them on.</p>
      )}
    </form>
  );
}
