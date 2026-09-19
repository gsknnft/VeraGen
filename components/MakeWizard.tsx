"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { linkWallet } from "@/lib/link-wallet-client";
import { VIBE_OPTIONS, type Vibe } from "@/lib/vibes";
import { HiggsfieldConnection } from "@/components/HiggsfieldConnection";
import type { GenerationMode } from "@/components/GeneratePanel";

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

interface ClaimedMint {
  id: string;
  mintNumber: number;
  status: "processing" | "completed" | "failed";
  imageUrl: string | null;
  videoUrl: string | null;
  collectionName: string;
}

interface ClaimLink {
  id: string;
  name: string;
}

type EntryTab = "hold" | "upload" | "generate";
type HoldStep = 1 | 2 | 3;

const ENTRY_TABS: { id: EntryTab; label: string }[] = [
  { id: "hold", label: "Hold a token" },
  { id: "upload", label: "Upload a clip" },
  { id: "generate", label: "Generate" },
];

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const UPLOAD_TYPES = ["video/mp4", "video/quicktime"];

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      Number.isFinite(video.duration) && video.duration > 0
        ? resolve(video.duration)
        : reject(new Error("Could not read this video's length."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot read that video. Try an MP4."));
    };
    video.src = url;
  });
}

function sharePath(url: string) {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return path.startsWith("/") ? path : `/s/${url.split("/").pop()}`;
}

function generationLabel(generation: GenerationMode) {
  if (generation === "own") return "Generate — uses my Higgsfield credits";
  if (generation === "none") return "Generation unavailable";
  return `Generate free (${generation.free} left)`;
}

/**
 * Growth-loop entry: three tabs mirroring Studio's Add-a-clip (Hold / Upload /
 * Generate). Every path lands on the same public `/s/[token]` unfurl. Studio
 * remains the full editor — this is the short share path only.
 */
export function MakeWizard({
  demoCollections,
  generation,
  claimedMints,
  claimLinks,
}: {
  demoCollections: DemoCollection[];
  generation: GenerationMode;
  claimedMints: ClaimedMint[];
  claimLinks: ClaimLink[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<EntryTab>("hold");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [clipId, setClipId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  // —— Hold a token ——
  const [holdStep, setHoldStep] = useState<HoldStep>(1);
  const [wallets, setWallets] = useState<string[] | null>(null);
  const [network, setNetwork] = useState<Network>("ethereum");
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [demoOnly, setDemoOnly] = useState(false);
  const [selected, setSelected] = useState<Nft | null>(null);
  const [vibe, setVibe] = useState<Exclude<Vibe, "custom">>("cinematic-pan");
  const [busy, setBusy] = useState<string | null>(null);

  // —— Upload ——
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // —— Generate ——
  const [genVibe, setGenVibe] = useState<Exclude<Vibe, "custom">>("cinematic-pan");
  const [genPrompt, setGenPrompt] = useState("");
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [genPreview, setGenPreview] = useState<string | null>(null);
  const [genFile, setGenFile] = useState<File | null>(null);
  const genInputRef = useRef<HTMLInputElement>(null);
  const genAttempt = useRef<string | null>(null);
  const [mintShares, setMintShares] = useState<Record<string, string>>({});
  const [mintShareBusy, setMintShareBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { address: string }[]) => {
        const list = rows.map((w) => w.address);
        setWallets(list);
        if (list.length > 0) setHoldStep(2);
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
    if (tab === "hold" && holdStep === 2 && wallets && wallets.length > 0) void loadNfts(network);
  }, [tab, holdStep, wallets, network, loadNfts]);

  useEffect(() => {
    if (!clipId || !shareUrl || genStatus === "completed" || genStatus === "failed") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/clips/${clipId}/status`).catch(() => null);
      if (!res?.ok) return;
      const clip = await res.json();
      setGenStatus(clip.status);
      if (clip.status === "completed" && shareUrl) {
        router.push(sharePath(shareUrl));
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [clipId, shareUrl, genStatus, router]);

  useEffect(
    () => () => {
      if (genPreview) URL.revokeObjectURL(genPreview);
    },
    [genPreview],
  );

  function switchTab(next: EntryTab) {
    setTab(next);
    setError(null);
  }

  function landOnShare(url: string, nextClipId?: string, status?: string) {
    setShareUrl(url);
    if (nextClipId) setClipId(nextClipId);
    setGenStatus(status ?? "completed");
    if (status === "completed" || !status) {
      router.push(sharePath(url));
    }
  }

  async function onLink() {
    setError(null);
    try {
      const address = await linkWallet(setBusy);
      setWallets((prev) => Array.from(new Set([...(prev ?? []), address])));
      setHoldStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that wallet.");
    } finally {
      setBusy(null);
    }
  }

  function pickNft(nft: Nft) {
    setSelected(nft);
    setHoldStep(3);
  }

  async function startHoldMotion() {
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
        router.push(sharePath(data.url));
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    } finally {
      setBusy(null);
    }
  }

  async function ensureMakeProject(): Promise<string> {
    const list = await fetch("/api/projects");
    if (list.ok) {
      const projects = (await list.json()) as { id: string; name: string }[];
      const existing = projects.find((p) => p.name === "Make — upload");
      if (existing) return existing.id;
    }
    const created = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Make — upload" }),
    });
    const data = await created.json();
    if (!created.ok) throw new Error(data.error ?? "Could not prepare upload.");
    return data.id as string;
  }

  async function uploadClip(file: File) {
    setError(null);
    if (!UPLOAD_TYPES.includes(file.type)) {
      setError("Upload an MP4 or MOV video.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Videos can be up to 64 MB.");
      return;
    }

    try {
      setUploadStatus("Reading video…");
      const durationSeconds = await readDuration(file);

      setUploadStatus("Preparing…");
      const projectId = await ensureMakeProject();

      setUploadStatus("Preparing upload…");
      const start = await fetch(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const ticket = await start.json();
      if (!start.ok) throw new Error(ticket.error ?? "Upload could not start.");

      setUploadStatus("Uploading…");
      const put = await fetch(ticket.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

      setUploadStatus("Saving clip…");
      const done = await fetch(`/api/projects/${projectId}/uploads/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ticket.key,
          durationSeconds,
          name: file.name.replace(/\.[^.]+$/, ""),
        }),
      });
      const clip = await done.json();
      if (!done.ok) throw new Error(clip.error ?? "Upload could not be saved.");

      setUploadStatus("Creating share link…");
      const shareRes = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId: clip.id, title: clip.prompt || "Uploaded clip" }),
      });
      const share = await shareRes.json();
      if (!shareRes.ok) throw new Error(share.error ?? "Could not create share link.");
      landOnShare(share.url, clip.id, "completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStatus(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function startGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (genBusy || generation === "none") return;
    setError(null);
    setGenBusy("Starting generation…");
    try {
      genAttempt.current ??= crypto.randomUUID();
      const form = new FormData();
      form.append("attempt", genAttempt.current);
      form.append("vibe", genVibe);
      const prompt =
        genPrompt.trim() || VIBE_OPTIONS.find((v) => v.id === genVibe)?.prompt || "";
      form.append("prompt", prompt);
      if (genFile) form.append("image", genFile);

      const res = await fetch("/api/make/generate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start generation.");
      genAttempt.current = null;
      setShareUrl(data.url);
      setClipId(data.clipId);
      setGenStatus(data.status ?? "processing");
      if (data.status === "completed" && data.url) {
        router.push(sharePath(data.url));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    } finally {
      setGenBusy(null);
    }
  }

  async function shareMint(mintId: string) {
    if (mintShareBusy) return;
    setMintShareBusy(mintId);
    setError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create share link.");
      setMintShares((prev) => ({ ...prev, [mintId]: data.url }));
      landOnShare(data.url, undefined, "completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create share link.");
    } finally {
      setMintShareBusy(null);
    }
  }

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
      <div className="tabs" role="tablist" aria-label="Ways to make a shareable clip">
        {ENTRY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hold" && (
        <>
          <ol className="make-steps" aria-label="Hold a token progress">
            <li aria-current={holdStep === 1 ? "step" : undefined} className={holdStep >= 1 ? "done" : ""}>
              1. Link wallet
            </li>
            <li aria-current={holdStep === 2 ? "step" : undefined} className={holdStep >= 2 ? "done" : ""}>
              2. Pick your NFT
            </li>
            <li aria-current={holdStep === 3 ? "step" : undefined} className={holdStep >= 3 ? "done" : ""}>
              3. Pick a motion
            </li>
          </ol>

          {holdStep === 1 && (
            <section className="nft-picker panel">
              <p className="subtitle">Link the wallet that holds your NFT</p>
              <p className="hint">
                You&apos;ll sign a message — no gas, no spending access. Any NFT you hold works; nothing is gated to a
                single collection.
              </p>
              <button type="button" className="primary" disabled={!!busy || wallets === null} onClick={onLink}>
                {busy ?? "Link wallet"}
              </button>
            </section>
          )}

          {holdStep === 2 && (
            <section className="nft-picker panel">
              <p className="subtitle">Pick any NFT you hold</p>
              <div className="export-row">
                <select
                  aria-label="Network"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value as Network)}
                >
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button type="button" className="timeline-delete" disabled={!!busy} onClick={onLink}>
                  Link another
                </button>
              </div>
              {demoCollections.length > 0 && (
                <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={demoOnly} onChange={(e) => setDemoOnly(e.target.checked)} />
                  Show demo collections only ({demoCollections.map((d) => d.label).join(", ")}) — optional filter, not
                  a gate
                </label>
              )}
              {busy && <p className="hint">{busy}</p>}
              {visibleNfts && visibleNfts.length === 0 && !busy && (
                <p className="hint">
                  No NFTs on {network} in your linked wallet{wallets && wallets.length > 1 ? "s" : ""}.
                </p>
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
                      {n.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.thumbnailUrl} alt={n.name} loading="lazy" />
                      ) : (
                        <span className="nft-missing">no image</span>
                      )}
                      <span>{n.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {holdStep === 3 && selected && !shareUrl && (
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
                <button type="button" className="timeline-delete" disabled={!!busy} onClick={() => setHoldStep(2)}>
                  Back
                </button>
                <button type="button" className="primary" disabled={!!busy} onClick={startHoldMotion}>
                  {busy ?? "Animate & get share link"}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {tab === "upload" && !shareUrl && (
        <section className="panel">
          <p className="subtitle">Upload a clip — no wallet needed</p>
          <p className="hint">MP4 or MOV, up to 64 MB. Lands on a public share page that unfurls on Discord and X.</p>
          <button
            type="button"
            className="primary"
            disabled={!!uploadStatus}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploadStatus ?? "Choose video"}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadClip(file);
            }}
          />
        </section>
      )}

      {tab === "generate" && !shareUrl && (
        <section className="panel">
          <p className="subtitle">Generate a clip</p>
          {generation === "none" ? (
            <div className="make-unavailable">
              <p className="hint" role="status">
                Generation is unavailable right now — no free trial slots and no Higgsfield account connected. Connect
                your own key below, upload a clip, or share a mint you already claimed.
              </p>
              <HiggsfieldConnection />
            </div>
          ) : (
            <form className="generate-panel" onSubmit={startGenerate}>
              <p className="hint">
                {generation === "own"
                  ? "Uses your connected Higgsfield credits."
                  : `${generation.free} free generation${generation.free === 1 ? "" : "s"} left on us.`}
              </p>
              <div
                className={`dropzone small ${genPreview ? "active" : ""}`}
                onClick={() => genInputRef.current?.click()}
              >
                {genPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={genPreview} alt="Selected reference" />
                ) : (
                  <span>Optional reference image (tap to add)</span>
                )}
                <input
                  ref={genInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setGenFile(f);
                      setGenPreview(URL.createObjectURL(f));
                    }
                  }}
                />
              </div>
              <div className="vibe-grid">
                {VIBE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={genVibe === v.id ? "vibe-chip active" : "vibe-chip"}
                    onClick={() => {
                      setGenVibe(v.id);
                      setGenPrompt(v.prompt);
                    }}
                    disabled={!!genBusy}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Or describe the motion yourself…"
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                rows={3}
              />
              <button className="primary" type="submit" disabled={!!genBusy}>
                {genBusy ?? generationLabel(generation)}
              </button>
            </form>
          )}

          {(claimedMints.length > 0 || claimLinks.length > 0) && (
            <div className="make-mint-claim">
              <p className="subtitle">Mint-claim path</p>
              <p className="hint">
                Already minted on a sponsored collection? Claim the video your mint paid for, then share it.
              </p>
              {claimLinks.length > 0 && (
                <ul className="make-claim-links">
                  {claimLinks.map((c) => (
                    <li key={c.id}>
                      <Link href={`/claim/${c.id}`}>Claim on {c.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
              {claimedMints.length > 0 && (
                <div className="nft-grid">
                  {claimedMints.map((m) => (
                    <div key={m.id} className="nft-tile make-mint-tile">
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imageUrl} alt={`${m.collectionName} #${m.mintNumber}`} />
                      ) : (
                        <span className="nft-missing">#{m.mintNumber}</span>
                      )}
                      <span>
                        {m.collectionName} #{m.mintNumber}
                      </span>
                      <span className="hint">{m.status}</span>
                      {(m.status === "completed" || m.videoUrl) && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={mintShareBusy === m.id}
                          onClick={() => shareMint(m.id)}
                        >
                          {mintShares[m.id]
                            ? "Open share"
                            : mintShareBusy === m.id
                              ? "Sharing…"
                              : "Get share link"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {shareUrl && (
        <section className="panel">
          <p className="subtitle">
            {genStatus === "completed"
              ? "Ready — opening your share page…"
              : genStatus === "failed"
                ? "Generation failed. Your share link still has the poster."
                : "Working… your share link is ready (poster unfurls now; video appears when done)."}
          </p>
          <div className="export-row">
            <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button type="button" className="primary" onClick={() => router.push(sharePath(shareUrl))}>
              Open share page
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
