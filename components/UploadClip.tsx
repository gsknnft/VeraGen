"use client";

import { useRef, useState } from "react";
import type { ClipData } from "./Timeline";

const MAX_BYTES = 64 * 1024 * 1024;
const TYPES = ["video/mp4", "video/quicktime"];

/** The browser already knows the length; asking it avoids a server download. */
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

/**
 * Bring your own footage — no Higgsfield account needed.
 *
 * This is what lets someone use the editor, brand kit and export the moment
 * they sign in. Generation becomes something you add, not a toll at the door.
 */
export function UploadClip({ projectId, onUploaded }: { projectId: string; onUploaded: (clip: ClipData) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Upload an MP4 or MOV video.");
    if (file.size > MAX_BYTES) return setError("Videos can be up to 64 MB.");

    try {
      setStatus("Reading video…");
      const durationSeconds = await readDuration(file);

      setStatus("Preparing upload…");
      const start = await fetch(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const ticket = await start.json();
      if (!start.ok) throw new Error(ticket.error ?? "Upload could not start.");

      setStatus("Uploading…");
      // Straight to the bucket. Content-Type must match what was signed, or
      // the bucket rejects the PUT.
      const put = await fetch(ticket.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

      setStatus("Adding to timeline…");
      const done = await fetch(`/api/projects/${projectId}/uploads/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ticket.key, durationSeconds, name: file.name.replace(/\.[^.]+$/, "") }),
      });
      const clip = await done.json();
      if (!done.ok) throw new Error(clip.error ?? "Upload could not be saved.");
      onUploaded(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setStatus(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="upload-clip">
      <button type="button" className="secondary" disabled={!!status} onClick={() => inputRef.current?.click()}>
        {status ?? "Upload your own clip"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className="hint">MP4 or MOV, up to 64 MB. No Higgsfield account needed.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
