"use client";

import { useRef, useState } from "react";

type Vibe =
  | "cinematic-pan"
  | "dance-loop"
  | "talking-head"
  | "action-hero"
  | "retro-film"
  | "product-hold";

const VIBES: { id: Vibe; label: string }[] = [
  { id: "cinematic-pan", label: "🎬 Cinematic pan" },
  { id: "dance-loop", label: "💃 Dance loop" },
  { id: "talking-head", label: "🎤 Talking head" },
  { id: "action-hero", label: "🦸 Action hero" },
  { id: "retro-film", label: "📼 Retro film" },
  { id: "product-hold", label: "📦 Product hold" },
];

type Stage = "idle" | "submitting" | "processing" | "done" | "error";

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [vibe, setVibe] = useState<Vibe>("cinematic-pan");
  const [stage, setStage] = useState<Stage>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileSelected(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStage("idle");
    setVideoUrl(null);
    setErrorMsg(null);
  }

  async function pollStatus(requestId: string) {
    const started = Date.now();
    const TIMEOUT_MS = 4 * 60 * 1000;

    while (Date.now() - started < TIMEOUT_MS) {
      const res = await fetch(`/api/status/${requestId}`);
      const data = await res.json();

      if (data.status === "completed") {
        setVideoUrl(data.videoUrl);
        setStage("done");
        return;
      }
      if (data.status === "failed") {
        setErrorMsg(data.error ?? "Generation failed");
        setStage("error");
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    setErrorMsg("Timed out waiting for the video. Try again.");
    setStage("error");
  }

  async function handleGenerate() {
    if (!file) return;
    setStage("submitting");
    setErrorMsg(null);

    const form = new FormData();
    form.append("image", file);
    form.append("vibe", vibe);

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong");
        setStage("error");
        return;
      }

      setStage("processing");
      await pollStatus(data.requestId);
    } catch {
      setErrorMsg("Network error. Try again.");
      setStage("error");
    }
  }

  const shareText = encodeURIComponent(
    "Made this in under 2 minutes with one face photo — no prompt engineering. Built on @higgsfield's API."
  );

  return (
    <main>
      <h1>loopface</h1>
      <p className="subtitle">One face photo in. A shareable video out.</p>

      {!videoUrl && (
        <>
          <div
            className={`dropzone ${preview ? "active" : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected face" />
            ) : (
              <span>Tap to upload a face photo</span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileSelected(f);
              }}
            />
          </div>

          <div className="vibe-grid">
            {VIBES.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`vibe-button ${vibe === v.id ? "selected" : ""}`}
                onClick={() => setVibe(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            className="primary"
            disabled={!file || stage === "submitting" || stage === "processing"}
            onClick={handleGenerate}
          >
            {stage === "submitting" && "Starting…"}
            {stage === "processing" && "Generating (~1-2 min)…"}
            {(stage === "idle" || stage === "error") && "Generate video"}
          </button>

          {errorMsg && <p className="error">{errorMsg}</p>}
        </>
      )}

      {videoUrl && (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={videoUrl} controls autoPlay loop />
          <div className="share-row">
            <a href={videoUrl} download="loopface.mp4">
              Download
            </a>
            <a
              href={`https://x.com/intent/post?text=${shareText}`}
              target="_blank"
              rel="noreferrer"
            >
              Post to X
            </a>
          </div>
          <button
            className="primary"
            onClick={() => {
              setPreview(null);
              setFile(null);
              setVideoUrl(null);
              setStage("idle");
            }}
          >
            Make another
          </button>
        </>
      )}
    </main>
  );
}
