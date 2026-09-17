"use client";

import { useRef, useState } from "react";
import { VIBE_OPTIONS, type Vibe } from "@/lib/vibes";

interface GeneratePanelProps {
  onGenerate: (form: FormData) => Promise<void>;
  disabled: boolean;
}

export function GeneratePanel({ onGenerate, disabled }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [vibe, setVibe] = useState<Vibe>("custom");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function applyVibe(id: Vibe, presetPrompt: string) {
    setVibe(id);
    setPrompt(presetPrompt);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("Write a prompt, or pick a vibe to start from.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("vibe", vibe);
    if (file) form.append("image", file);

    try {
      await onGenerate(form);
      setPrompt("");
      setVibe("custom");
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="generate-panel" onSubmit={handleSubmit}>
      <div
        className={`dropzone small ${preview ? "active" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected face" />
        ) : (
          <span>Tap to add a face photo (optional)</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              setPreview(URL.createObjectURL(f));
            }
          }}
        />
      </div>

      <textarea
        placeholder="Describe the clip — camera movement, action, mood…"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setVibe("custom");
        }}
        rows={3}
      />

      <div className="vibe-grid">
        {VIBE_OPTIONS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`vibe-button ${vibe === v.id ? "selected" : ""}`}
            onClick={() => applyVibe(v.id, v.prompt)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <button className="primary" type="submit" disabled={disabled || submitting}>
        {submitting ? "Starting…" : "Add clip"}
      </button>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
