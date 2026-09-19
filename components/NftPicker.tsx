"use client";

import { useCallback, useEffect, useState } from "react";
import { linkWallet } from "@/lib/link-wallet-client";
import type { CharacterData } from "./CharacterPanel";

type Network = "ethereum" | "base" | "polygon" | "arbitrum" | "optimism";
const NETWORKS: Network[] = ["ethereum", "base", "polygon", "arbitrum", "optimism"];

interface Nft {
  network: Network;
  contract: string;
  tokenId: string;
  name: string;
  collectionName: string | null;
  thumbnailUrl: string | null;
  traits: { trait: string; value: string }[];
}

/**
 * "Make my NFT move": link a wallet by signature, pick a token you hold, and
 * it becomes a Character whose art every generation animates.
 *
 * Signing proves control of the wallet; it is not a transaction, costs no gas,
 * and grants no spending access. The server re-checks ownership of the exact
 * token when it is picked.
 */
export function NftPicker({ projectId, onCreated }: { projectId: string; onCreated: (character: CharacterData) => void }) {
  const [wallets, setWallets] = useState<string[] | null>(null);
  const [network, setNetwork] = useState<Network>("ethereum");
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet").then(r => (r.ok ? r.json() : [])).then((rows: { address: string }[]) => setWallets(rows.map(w => w.address))).catch(() => setWallets([]));
  }, []);

  const loadNfts = useCallback(async (net: Network) => {
    setBusy("Loading your NFTs…"); setError(null);
    try {
      const res = await fetch(`/api/wallet/nfts?network=${net}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load your NFTs.");
      setNfts(data.nfts); setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your NFTs.");
    } finally { setBusy(null); }
  }, []);

  useEffect(() => { if (wallets?.length) void loadNfts(network); }, [wallets, network, loadNfts]);

  async function onLink() {
    setError(null);
    try {
      const address = await linkWallet(setBusy);
      setWallets(prev => Array.from(new Set([...(prev ?? []), address])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that wallet.");
    } finally { setBusy(null); }
  }

  async function pick(nft: Nft) {
    setBusy(`Adding ${nft.name}…`); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/from-nft`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: nft.network, contract: nft.contract, tokenId: nft.tokenId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add that NFT.");
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that NFT.");
    } finally { setBusy(null); }
  }

  return (
    <section className="nft-picker">
      <p className="subtitle">Make your NFT move</p>
      {wallets === null ? null : wallets.length === 0 ? (
        <>
          <p className="hint">Link a wallet to pick an NFT you hold. You&apos;ll sign a message; it costs no gas and grants no access to your funds.</p>
          <button type="button" className="secondary" disabled={!!busy} onClick={onLink}>{busy ?? "Link wallet"}</button>
        </>
      ) : (
        <>
          <div className="export-row">
            <select aria-label="Network" value={network} onChange={e => setNetwork(e.target.value as Network)}>
              {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="timeline-delete" disabled={!!busy} onClick={onLink}>Link another wallet</button>
          </div>
          {busy && <p className="hint">{busy}</p>}
          {nfts && nfts.length === 0 && !busy && <p className="hint">No NFTs on {network} in your linked wallet{wallets.length > 1 ? "s" : ""}.</p>}
          {nfts && nfts.length > 0 && (
            <div className="nft-grid">
              {nfts.map(n => (
                <button type="button" key={`${n.contract}:${n.tokenId}`} className="nft-tile" disabled={!!busy} onClick={() => pick(n)} title={n.traits.map(t => `${t.trait}: ${t.value}`).join("\n")}>
                  {n.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={n.thumbnailUrl} alt={n.name} loading="lazy" />
                    : <span className="nft-missing">no image</span>}
                  <span>{n.name}</span>
                </button>
              ))}
            </div>
          )}
          {truncated && <p className="hint">Showing the first 500 per wallet.</p>}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
