"use client";

import { useRef, useState } from "react";
import { VIBE_OPTIONS, type Vibe } from "@/lib/vibes";

interface GeneratePanelProps {
  onGenerate: (form: FormData) => Promise<void>;
  disabled: boolean;
  selectedCharacterId: string | null;
  selectedCharacterName: string | null;
}

export function GeneratePanel({
  onGenerate,
  disabled,
  selectedCharacterId,
  selectedCharacterName,
}: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [vibe, setVibe] = useState<Vibe>("custom");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<string | null>(null);
  const sending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function applyVibe(id: Vibe, presetPrompt: string) {
    setVibe(id);
    setPrompt(presetPrompt);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    if (!prompt.trim()) {
      setError("Write a prompt, or pick a vibe to start from.");
      return;
    }
    sending.current = true;
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    attempt.current ??= crypto.randomUUID();
    form.append("attempt", attempt.current);
    form.append("prompt", prompt);
    form.append("vibe", vibe);
    if (selectedCharacterId) {
      form.append("characterId", selectedCharacterId);
    } else if (file) {
      form.append("image", file);
    }

    try {
      await onGenerate(form);
      attempt.current = null;
      setPrompt("");
      setVibe("custom");
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="generate-panel" onSubmit={handleSubmit}>
      {selectedCharacterId ? (
        <p className="subtitle">Using character: {selectedCharacterName}</p>
      ) : (
        <div
          className={`dropzone small ${preview ? "active" : ""}`}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected reference" />
          ) : (
            <span>Tap to add a reference image (optional, one-off)</span>
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
      )}

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
        {submitting ? "Starting…" : "Generate ? my Higgsfield credits"}
      </button>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
