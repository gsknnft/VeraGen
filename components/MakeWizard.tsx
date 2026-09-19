"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { linkWallet } from "@/lib/link-wallet-client";
import { VIBE_OPTIONS, type Vibe } from "@/lib/vibes";

type Network = "ethereum" | "base" | "polygon" | "arbitrum" | "optimism";
const NETWORKS: Network[] = ["ethereum", "base", "polygon", "arbitrum", "optimism"];

interface Nft {
  network: Network;
  contract: string;
  tokenId: string;
  name: string;
  collectionName: string | null;
  thumbnailUrl: string | null;
}

interface DemoCollection {
  network: string;
  contract: string;
  label: string;
}

type Step = 1 | 2 | 3;

/**
 * Holder growth loop: link wallet → pick any NFT you hold → pick a motion →
 * land on a public share URL. Collapses the old ~9-step studio path.
 */
export function MakeWizard({ demoCollections }: { demoCollections: DemoCollection[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [wallets, setWallets] = useState<string[] | null>(null);
  const [network, setNetwork] = useState<Network>("ethereum");
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [demoOnly, setDemoOnly] = useState(false);
  const [selected, setSelected] = useState<Nft | null>(null);
  const [vibe, setVibe] = useState<Exclude<Vibe, "custom">>("cinematic-pan");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [clipId, setClipId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { address: string }[]) => {
        const list = rows.map((w) => w.address);
        setWallets(list);
        if (list.length > 0) setStep(2);
      })
      .catch(() => setWallets([]));
  }, []);

  const loadNfts = useCallback(async (net: Network) => {
    setBusy("Loading your NFTs…");
    setError(null);
    try {
      const res = await fetch(`/api/wallet/nfts?network=${net}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load your NFTs.");
      setNfts(data.nfts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your NFTs.");
      setNfts([]);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && wallets && wallets.length > 0) void loadNfts(network);
  }, [step, wallets, network, loadNfts]);

  async function onLink() {
    setError(null);
    try {
      const address = await linkWallet(setBusy);
      setWallets((prev) => Array.from(new Set([...(prev ?? []), address])));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that wallet.");
    } finally {
      setBusy(null);
    }
  }

  function pickNft(nft: Nft) {
    setSelected(nft);
    setStep(3);
  }

  async function startMotion() {
    if (!selected || busy) return;
    setError(null);
    setBusy("Starting motion…");
    try {
      const attempt = crypto.randomUUID();
      const res = await fetch("/api/make/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: selected.network,
          contract: selected.contract,
          tokenId: selected.tokenId,
          vibe,
          attempt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start generation.");
      setShareUrl(data.url);
      setClipId(data.clipId);
      setGenStatus(data.status ?? "processing");
      if (data.status === "completed" && data.url) {
        router.push(data.url.replace(/^https?:\/\/[^/]+/, "") || `/s/${data.shareToken}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!clipId || !shareUrl || genStatus === "completed" || genStatus === "failed") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/clips/${clipId}/status`).catch(() => null);
      if (!res?.ok) return;
      const clip = await res.json();
      setGenStatus(clip.status);
      if (clip.status === "completed" && shareUrl) {
        const path = shareUrl.replace(/^https?:\/\/[^/]+/, "");
        router.push(path.startsWith("/") ? path : `/s/${shareUrl.split("/").pop()}`);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [clipId, shareUrl, genStatus, router]);

  const visibleNfts =
    nfts && demoOnly && demoCollections.length > 0
      ? nfts.filter((n) =>
          demoCollections.some(
            (d) => d.network === n.network && d.contract.toLowerCase() === n.contract.toLowerCase(),
          ),
        )
      : nfts;

  return (
    <div className="make-wizard">
      <ol className="make-steps" aria-label="Progress">
        <li aria-current={step === 1 ? "step" : undefined} className={step >= 1 ? "done" : ""}>1. Link wallet</li>
        <li aria-current={step === 2 ? "step" : undefined} className={step >= 2 ? "done" : ""}>2. Pick your NFT</li>
        <li aria-current={step === 3 ? "step" : undefined} className={step >= 3 ? "done" : ""}>3. Pick a motion</li>
      </ol>

      {step === 1 && (
        <section className="nft-picker panel">
          <p className="subtitle">Link the wallet that holds your NFT</p>
          <p className="hint">You&apos;ll sign a message — no gas, no spending access. Any NFT you hold works; nothing is gated to a single collection.</p>
          <button type="button" className="primary" disabled={!!busy || wallets === null} onClick={onLink}>
            {busy ?? "Link wallet"}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="nft-picker panel">
          <p className="subtitle">Pick any NFT you hold</p>
          <div className="export-row">
            <select aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
              {NETWORKS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="button" className="timeline-delete" disabled={!!busy} onClick={onLink}>Link another</button>
          </div>
          {demoCollections.length > 0 && (
            <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={demoOnly} onChange={(e) => setDemoOnly(e.target.checked)} />
              Show demo collections only ({demoCollections.map((d) => d.label).join(", ")}) — optional filter, not a gate
            </label>
          )}
          {busy && <p className="hint">{busy}</p>}
          {visibleNfts && visibleNfts.length === 0 && !busy && (
            <p className="hint">No NFTs on {network} in your linked wallet{wallets && wallets.length > 1 ? "s" : ""}.</p>
          )}
          {visibleNfts && visibleNfts.length > 0 && (
            <div className="nft-grid">
              {visibleNfts.map((n) => (
                <button
                  type="button"
                  key={`${n.contract}:${n.tokenId}`}
                  className="nft-tile"
                  disabled={!!busy}
                  onClick={() => pickNft(n)}
                >
                  {n.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={n.thumbnailUrl} alt={n.name} loading="lazy" />
                    : <span className="nft-missing">no image</span>}
                  <span>{n.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 3 && selected && !shareUrl && (
        <section className="panel">
          <p className="subtitle">Motion for {selected.name}</p>
          <div className="vibe-grid">
            {VIBE_OPTIONS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={vibe === v.id ? "vibe-chip active" : "vibe-chip"}
                onClick={() => setVibe(v.id)}
                disabled={!!busy}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="export-row">
            <button type="button" className="timeline-delete" disabled={!!busy} onClick={() => setStep(2)}>Back</button>
            <button type="button" className="primary" disabled={!!busy} onClick={startMotion}>
              {busy ?? "Animate & get share link"}
            </button>
          </div>
        </section>
      )}

      {shareUrl && (
        <section className="panel">
          <p className="subtitle">
            {genStatus === "completed"
              ? "Ready — opening your share page…"
              : genStatus === "failed"
                ? "Generation failed. Your share link still has the poster."
                : "Animating… your share link is ready (poster unfurls now; video appears when done)."}
          </p>
          <div className="export-row">
            <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="primary"
              onClick={() => {
                const path = shareUrl.replace(/^https?:\/\/[^/]+/, "");
                router.push(path.startsWith("/") ? path : `/s/${shareUrl.split("/").pop()}`);
              }}
            >
              Open share page
            </button>
          </div>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
