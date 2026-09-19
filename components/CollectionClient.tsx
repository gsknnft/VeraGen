"use client";

import { useEffect, useRef, useState } from "react";
import { ClaimSettings, type ClaimConfig } from "./ClaimSettings";

interface TraitOption {
  id: string;
  label: string;
  promptFragment: string;
  weight: number;
  /** The option's art layer; every option needs one before minting. */
  layerImageUrl?: string | null;
}

interface TraitCategory {
  id: string;
  name: string;
  options: TraitOption[];
}

interface MintTrait {
  traitOption: TraitOption;
}

interface MintData {
  id: string;
  mintNumber: number;
  status: "processing" | "completed" | "failed";
  videoUrl: string | null;
  /** The composited identity still, available as soon as the mint exists. */
  imageUrl?: string | null;
  errorMessage: string | null;
  traits: MintTrait[];
}

const POLL_INTERVAL_MS = 3000;
const STYLE_LOCK_DEBOUNCE_MS = 600;

export function CollectionClient({
  collectionId,
  initialName,
  initialStyleLock,
  initialCategories,
  initialMints,
  initialClaims,
}: {
  collectionId: string;
  initialName: string;
  initialStyleLock: string | null;
  initialCategories: TraitCategory[];
  initialMints: MintData[];
  initialClaims: ClaimConfig;
}) {
  const [categories, setCategories] = useState<TraitCategory[]>(initialCategories);
  const [mints, setMints] = useState<MintData[]>(initialMints);
  const [styleLock, setStyleLock] = useState(initialStyleLock ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const styleLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasProcessing = mints.some((m) => m.status === "processing");

  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(async () => {
      const processing = mints.filter((m) => m.status === "processing");
      const updates = await Promise.all(
        processing.map((m) =>
          fetch(`/api/mints/${m.id}/status`).then((r) => r.ok ? r.json() as Promise<MintData> : m).catch(() => m)
        )
      );
      setMints((prev) => {
        const byId = new Map(updates.map((u) => [u.id, u]));
        return prev.map((m) => byId.get(m.id) ?? m);
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessing, mints]);

  function handleStyleLockChange(value: string) {
    setStyleLock(value);
    if (styleLockTimer.current) clearTimeout(styleLockTimer.current);
    styleLockTimer.current = setTimeout(() => {
      fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleLock: value || null }),
      }).catch(() => {});
    }, STYLE_LOCK_DEBOUNCE_MS);
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await fetch(`/api/collections/${collectionId}/trait-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((prev) => [...prev, data]);
      setNewCategoryName("");
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    fetch(`/api/trait-categories/${categoryId}`, { method: "DELETE" }).catch(() => {});
  }

  async function handleAddOption(
    categoryId: string,
    label: string,
    promptFragment: string,
    weight: number
  ) {
    const res = await fetch(`/api/trait-categories/${categoryId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, promptFragment, weight }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, options: [...c.options, data] } : c))
      );
    }
  }

  function handleDeleteOption(categoryId: string, optionId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId ? { ...c, options: c.options.filter((o) => o.id !== optionId) } : c
      )
    );
    fetch(`/api/trait-options/${optionId}`, { method: "DELETE" }).catch(() => {});
  }

  async function handleMint() {
    setMinting(true);
    setMintError(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddress.trim() || undefined,
          txHash: txHash.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMintError(data.error ?? "Mint failed");
        return;
      }
      setMints((prev) => [...prev, data]);
    } catch {
      setMintError("Network error while minting");
    } finally {
      setMinting(false);
    }
  }

  const hasOptions = categories.some((c) => c.options.length > 0);
  // Every rollable option needs art: the mint animates the composited layers,
  // and an option without a layer would leave nothing but words to animate.
  const missingLayers = categories.flatMap((c) => c.options.filter((o) => !o.layerImageUrl).map((o) => o.label));
  const canMint = hasOptions && missingLayers.length === 0;

  function handleLayerUploaded(categoryId: string, option: TraitOption) {
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, options: c.options.map((o) => (o.id === option.id ? option : o)) } : c))
    );
  }

  return (
    <div className="studio">
      <label className="style-lock">
        World style lock
        <input
          type="text"
          placeholder="e.g. flat vector illustration, pastel palette, thick black outline"
          value={styleLock}
          onChange={(e) => handleStyleLockChange(e.target.value)}
        />
      </label>

      <section>
        <p className="subtitle">Trait categories</p>
        {categories.map((category) => (
          <TraitCategoryRow
            key={category.id}
            category={category}
            onDeleteCategory={() => handleDeleteCategory(category.id)}
            onAddOption={(label, fragment, weight) =>
              handleAddOption(category.id, label, fragment, weight)
            }
            onDeleteOption={(optionId) => handleDeleteOption(category.id, optionId)}
            onLayerUploaded={(option) => handleLayerUploaded(category.id, option)}
          />
        ))}

        <form className="character-form" onSubmit={handleAddCategory}>
          <input
            type="text"
            placeholder="New category, e.g. Element"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <button className="primary" type="submit">
            Add category
          </button>
        </form>
      </section>

      <section>
        <p className="subtitle">
          Optional: fold a wallet address / tx hash into the mint seed, so
          the roll is tied to that specific action instead of just a
          sequence number.
        </p>
        <div className="trim-row">
          <label>
            Wallet address
            <input
              type="text"
              placeholder="0x…"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
          </label>
          <label>
            Tx hash
            <input
              type="text"
              placeholder="0x…"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
          </label>
        </div>
        <div className="export-row">
          <button className="primary" onClick={handleMint} disabled={minting || !canMint}>
            {minting ? "Minting…" : "Generate next mint"}
          </button>
          {!hasOptions && <p className="subtitle">Add at least one trait option to mint.</p>}
          {hasOptions && missingLayers.length > 0 && (
            <p className="subtitle">
              Add layer art to every option before minting ({missingLayers.length} missing: {missingLayers.slice(0, 4).join(", ")}{missingLayers.length > 4 ? "…" : ""}).
            </p>
          )}
        </div>
        {mintError && <p className="error">{mintError}</p>}

        <div className="timeline-track" style={{ flexWrap: "wrap" }}>
          {mints.map((mint) => (
            <div key={mint.id} className="timeline-item" style={{ cursor: "default" }}>
              {mint.status === "completed" && mint.videoUrl && (
                <video src={mint.videoUrl} poster={mint.imageUrl ?? undefined} muted loop autoPlay className="timeline-thumb" />
              )}
              {mint.status === "processing" && (mint.imageUrl
                // The identity exists before the video does: show it while it animates.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mint.imageUrl} alt={`Mint #${mint.mintNumber}`} className="timeline-thumb processing" />
                : <div className="timeline-thumb processing">…</div>)}
              {mint.status === "failed" && <div className="timeline-thumb failed">✕</div>}
              <p className="timeline-label">#{mint.mintNumber}</p>
              <p style={{ fontSize: "0.7rem", color: "#777" }}>
                {mint.traits.map((t) => t.traitOption.label).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <ClaimSettings collectionId={collectionId} initial={initialClaims} />
      </section>
    </div>
  );
}

function TraitCategoryRow({
  category,
  onDeleteCategory,
  onAddOption,
  onDeleteOption,
  onLayerUploaded,
}: {
  category: TraitCategory;
  onDeleteCategory: () => void;
  onAddOption: (label: string, promptFragment: string, weight: number) => void;
  onDeleteOption: (optionId: string) => void;
  onLayerUploaded: (option: TraitOption) => void;
}) {
  const [layerError, setLayerError] = useState<string | null>(null);

  async function uploadLayer(optionId: string, file: File) {
    setLayerError(null);
    const form = new FormData();
    form.append("layer", file);
    const res = await fetch(`/api/trait-options/${optionId}/layer`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setLayerError(data.error ?? "Layer upload failed.");
    onLayerUploaded(data);
  }

  const [label, setLabel] = useState("");
  const [fragment, setFragment] = useState("");
  const [weight, setWeight] = useState(1);

  return (
    <div className="character-form">
      <div className="export-row">
        <strong>{category.name}</strong>
        <button type="button" className="timeline-delete" onClick={onDeleteCategory}>
          Remove category
        </button>
      </div>

      <div className="vibe-grid">
        {category.options.map((o) => (
          <div key={o.id} className="vibe-button" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {o.layerImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.layerImageUrl} alt={`${o.label} layer`} style={{ width: 64, height: 64, objectFit: "contain", background: "repeating-conic-gradient(#2a2a2a 0% 25%, #1c1c1c 0% 50%) 50% / 12px 12px", borderRadius: 6 }} />
            ) : (
              <span style={{ fontSize: "0.7rem", color: "#d98a6a" }}>no layer art</span>
            )}
            <span>
              {o.label} (w{o.weight})
            </span>
            <label className="timeline-delete" style={{ cursor: "pointer" }}>
              {o.layerImageUrl ? "Replace layer" : "Add layer"}
              <input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLayer(o.id, file); e.target.value = ""; }} />
            </label>
            <button type="button" className="timeline-delete" onClick={() => onDeleteOption(o.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {layerError && <p className="error">{layerError}</p>}
      <div className="trim-row">
        <label>
          Label
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Weight
          <input
            type="number"
            min={1}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value) || 1)}
          />
        </label>
      </div>
      <input
        type="text"
        placeholder="Prompt fragment, e.g. iridescent scales, faint ember glow"
        value={fragment}
        onChange={(e) => setFragment(e.target.value)}
      />
      <button
        type="button"
        className="primary"
        onClick={() => {
          if (!label.trim() || !fragment.trim()) return;
          onAddOption(label, fragment, weight);
          setLabel("");
          setFragment("");
          setWeight(1);
        }}
      >
        Add option
      </button>
    </div>
  );
}
