"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { Timeline, type ClipData } from "./Timeline";
import { PreviewPlayer } from "./PreviewPlayer";
import type { TimelineClip } from "@/remotion/durationUtils";

const POLL_INTERVAL_MS = 3000;

export function StudioClient({
  projectId,
  initialClips,
}: {
  projectId: string;
  initialClips: ClipData[];
}) {
  const [clips, setClips] = useState<ClipData[]>(initialClips);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const trimTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const hasProcessing = clips.some((c) => c.status === "processing");

  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(async () => {
      const processing = clips.filter((c) => c.status === "processing");
      const updates = await Promise.all(
        processing.map((c) =>
          fetch(`/api/clips/${c.id}/status`).then((r) => r.json() as Promise<ClipData>)
        )
      );
      setClips((prev) => {
        const byId = new Map(updates.map((u) => [u.id, u]));
        return prev.map((c) => byId.get(c.id) ?? c);
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessing, clips]);

  const handleGenerate = useCallback(
    async (form: FormData) => {
      const res = await fetch(`/api/projects/${projectId}/clips`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setClips((prev) => [...prev, data]);
    },
    [projectId]
  );

  function handleReorder(orderedIds: string[]) {
    setClips((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      return orderedIds.map((id) => byId.get(id)!);
    });
    orderedIds.forEach((id, index) => {
      fetch(`/api/clips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: index }),
      }).catch(() => {});
    });
  }

  function handleTrimChange(clipId: string, trimStart: number, trimEnd: number) {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, trimStart, trimEnd } : c))
    );

    const existing = trimTimers.current.get(clipId);
    if (existing) clearTimeout(existing);
    trimTimers.current.set(
      clipId,
      setTimeout(() => {
        fetch(`/api/clips/${clipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trimStart, trimEnd }),
        }).catch(() => {});
      }, 400)
    );
  }

  function handleTransitionChange(clipId: string, transitionIn: "cut" | "crossfade") {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, transitionIn } : c)));
    fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transitionIn }),
    }).catch(() => {});
  }

  function handleDelete(clipId: string) {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    fetch(`/api/clips/${clipId}`, { method: "DELETE" }).catch(() => {});
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportUrl(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error ?? "Export failed");
        return;
      }
      setExportUrl(data.videoUrl);
    } catch {
      setExportError("Network error while exporting");
    } finally {
      setExporting(false);
    }
  }

  const completedClips: TimelineClip[] = clips
    .filter((c) => c.status === "completed" && c.videoUrl)
    .map((c) => ({
      id: c.id,
      videoUrl: c.videoUrl!,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd ?? c.durationSeconds ?? c.trimStart,
      transitionIn: c.transitionIn,
    }));

  return (
    <div className="studio">
      <PreviewPlayer clips={completedClips} />

      <Timeline
        clips={clips}
        onReorder={handleReorder}
        onTrimChange={handleTrimChange}
        onTransitionChange={handleTransitionChange}
        onDelete={handleDelete}
      />

      <GeneratePanel onGenerate={handleGenerate} disabled={false} />

      <div className="export-row">
        <button className="primary" onClick={handleExport} disabled={exporting || completedClips.length === 0}>
          {exporting ? "Rendering…" : "Export video"}
        </button>
        {exportError && <p className="error">{exportError}</p>}
        {exportUrl && (
          <a className="download-link" href={exportUrl} download>
            Download export
          </a>
        )}
      </div>
    </div>
  );
}
