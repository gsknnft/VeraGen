"use client";

import { useRef, useState } from "react";

export interface CharacterData {
  id: string;
  name: string;
  referenceImageUrl: string;
  notes: string | null;
}

interface CharacterPanelProps {
  projectId: string;
  characters: CharacterData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreated: (character: CharacterData) => void;
}

export function CharacterPanel({
  projectId,
  characters,
  selectedId,
  onSelect,
  onCreated,
}: CharacterPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !file) {
      setError("Give it a name and a reference photo");
      return;
    }
    setSaving(true);
    setError(null);

    const form = new FormData();
    form.append("name", name);
    form.append("image", file);

    try {
      const res = await fetch(`/api/projects/${projectId}/characters`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save character");
      onCreated(data);
      onSelect(data.id);
      setShowForm(false);
      setName("");
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="character-panel">
      <p className="subtitle">Characters — reuse a face across every clip</p>
      <div className="character-row">
        <button
          type="button"
          className={`character-chip ${selectedId === null ? "selected" : ""}`}
          onClick={() => onSelect(null)}
        >
          None
        </button>
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`character-chip ${selectedId === c.id ? "selected" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.referenceImageUrl} alt={c.name} />
            {c.name}
          </button>
        ))}
        <button type="button" className="character-chip add" onClick={() => setShowForm((s) => !s)}>
          + New
        </button>
      </div>

      {showForm && (
        <form className="character-form" onSubmit={handleCreate}>
          <div
            className="dropzone small"
            onClick={() => inputRef.current?.click()}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="New character" />
            ) : (
              <span>Reference photo</span>
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
          <input
            type="text"
            placeholder="Character name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save character"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </div>
  );
}
