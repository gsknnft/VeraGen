"use client";

import { useEffect, useState } from "react";
import { linkWallet } from "@/lib/link-wallet-client";

interface Claim {
  id: string;
  mintNumber: number;
  status: "processing" | "completed" | "failed";
  imageUrl: string | null;
  videoUrl: string | null;
  errorMessage: string | null;
}

type ClaimResult = { tokenId: string; status: string; mintId?: string; error?: string };

const POLL_INTERVAL_MS = 4000;

export function ClaimClient({
  collectionId, network, contract, initialWallets, initialClaims,
}: {
  collectionId: string;
  network: string;
  contract: string;
  initialWallets: string[];
  initialClaims: Claim[];
}) {
  const [wallets, setWallets] = useState(initialWallets);
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [shareBusy, setShareBusy] = useState<string | null>(null);

  async function shareClaim(mintId: string) {
    if (shareBusy) return;
    setShareBusy(mintId); setError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create share link.");
      setShareLinks(prev => ({ ...prev, [mintId]: data.url }));
      try { await navigator.clipboard.writeText(data.url); } catch { /* ignore */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create share link.");
    } finally { setShareBusy(null); }
  }


  // Poll anything still animating. The status route is open to the holder
  // who claimed the mint (ownerFilter "mint").
  const processing = claims.filter(c => c.status === "processing").map(c => c.id).join(",");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(async () => {
      const updates = await Promise.all(processing.split(",").map(id =>
        fetch(`/api/mints/${id}/status`).then(r => (r.ok ? r.json() : null)).catch(() => null)));
      setClaims(prev => prev.map(c => updates.find(u => u?.id === c.id) ?? c));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [processing]);

  async function onLink() {
    setError(null);
    try {
      const address = await linkWallet(setBusy);
      setWallets(prev => Array.from(new Set([...prev, address])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that wallet.");
    } finally { setBusy(null); }
  }

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null); setNotes([]); setBusy("Verifying your mint on-chain…");
    try {
      const res = await fetch(`/api/collections/${collectionId}/claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not claim that mint.");
      const results = data.results as ClaimResult[];
      setNotes(results.filter(r => r.status !== "started").map(r =>
        r.status === "already-claimed" ? `Token #${r.tokenId} was already claimed.` : `Token #${r.tokenId}: ${r.error ?? r.status}`));
      // Fetch each started claim so it appears with its identity image straight away.
      const started = await Promise.all(results.filter(r => r.status === "started" && r.mintId).map(r =>
        fetch(`/api/mints/${r.mintId}/status`).then(x => (x.ok ? x.json() : null)).catch(() => null)));
      setClaims(prev => [...started.filter(Boolean), ...prev.filter(c => !started.some(s => s?.id === c.id))]);
      setTxHash("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim that mint.");
    } finally { setBusy(null); }
  }

  return (
    <div className="studio">
      {wallets.length === 0 ? (
        <section className="nft-picker">
          <p className="subtitle">1. Link the wallet you minted with</p>
          <p className="hint">You&apos;ll sign a message to prove it&apos;s yours. It costs no gas and grants no access to your funds.</p>
          <button type="button" className="secondary" disabled={!!busy} onClick={onLink}>{busy ?? "Link wallet"}</button>
        </section>
      ) : (
        <form className="generate-panel" onSubmit={onClaim}>
          <p className="subtitle">Paste your mint transaction</p>
          <input
            type="text"
            placeholder="0x… (the transaction that minted your token)"
            value={txHash}
            onChange={e => setTxHash(e.target.value)}
            spellCheck={false}
          />
          <p className="hint">Minted on {network} from {contract.slice(0, 6)}…{contract.slice(-4)} to {wallets.length === 1 ? wallets[0].slice(0, 6) + "…" + wallets[0].slice(-4) : `one of your ${wallets.length} linked wallets`}.</p>
          <div className="export-row">
            <button className="primary" type="submit" disabled={!!busy || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}>{busy ?? "Claim my video"}</button>
            <button type="button" className="timeline-delete" disabled={!!busy} onClick={onLink}>Link another wallet</button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {notes.map(n => <p key={n} className="hint">{n}</p>)}

      {claims.length > 0 && (
        <section>
          <p className="subtitle">Your tokens</p>
          <div className="timeline-track" style={{ flexWrap: "wrap" }}>
            {claims.map(c => (
              <div key={c.id} className="timeline-item" style={{ cursor: "default" }}>
                {c.status === "completed" && c.videoUrl ? (
                  <video src={c.videoUrl} poster={c.imageUrl ?? undefined} muted loop autoPlay playsInline controls className="timeline-thumb" />
                ) : c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={`Token #${c.mintNumber}`} className={`timeline-thumb ${c.status === "failed" ? "failed" : "processing"}`} />
                ) : (
                  <div className="timeline-thumb processing">…</div>
                )}
                <p className="timeline-label">#{c.mintNumber} · {c.status === "processing" ? "coming to life…" : c.status}</p>
                {c.status === "failed" && <p className="hint">{c.errorMessage ?? "Generation failed."} Paste the same transaction to retry.</p>}
                {c.status === "completed" && c.videoUrl && (
                  <>
                    <a className="download-link" href={c.videoUrl} download>Download</a>
                    <button type="button" className="secondary" disabled={shareBusy === c.id} onClick={() => shareClaim(c.id)}>
                      {shareLinks[c.id] ? "Copy share link again" : (shareBusy === c.id ? "Sharing…" : "Get share link")}
                    </button>
                    {shareLinks[c.id] && <p className="hint">{shareLinks[c.id]}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
