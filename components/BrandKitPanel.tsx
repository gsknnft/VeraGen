"use client";

import { useRef, useState } from "react";
import type { BrandTemplate } from "@/remotion/durationUtils";

const TEMPLATE_OPTIONS: { id: BrandTemplate; label: string; description: string }[] = [
  { id: "none", label: "None", description: "Just the clips, no intro/outro" },
  { id: "teaser", label: "Teaser", description: "Clips + a CTA end card" },
  { id: "productReveal", label: "Product reveal", description: "Logo intro + CTA end card" },
  { id: "announcement", label: "Announcement", description: "Headline intro + CTA end card" },
];

interface BrandKitPanelProps {
  projectId: string;
  logoUrl: string | null;
  ctaText: string;
  template: BrandTemplate;
  onLogoUploaded: (url: string) => void;
  onCtaTextChange: (value: string) => void;
  onTemplateChange: (value: BrandTemplate) => void;
}

export function BrandKitPanel({
  projectId,
  logoUrl,
  ctaText,
  template,
  onLogoUploaded,
  onCtaTextChange,
  onTemplateChange,
}: BrandKitPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleLogoSelected(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("logo", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/brand-logo`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onLogoUploaded(data.brandLogoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="character-form">
      <p className="subtitle">Brand kit</p>

      <div
        className={`dropzone small ${logoUrl ? "active" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Brand logo" />
        ) : (
          <span>{uploading ? "Uploading…" : "Tap to add a logo"}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLogoSelected(f);
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}

      <input
        type="text"
        placeholder="End-card CTA text, e.g. Follow @yourhandle"
        value={ctaText}
        onChange={(e) => onCtaTextChange(e.target.value)}
      />

      <div className="template-grid">
        {TEMPLATE_OPTIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`vibe-button ${template === t.id ? "selected" : ""}`}
            onClick={() => onTemplateChange(t.id)}
            title={t.description}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
