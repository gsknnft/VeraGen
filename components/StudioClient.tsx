"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { Timeline, type ClipData } from "./Timeline";
import { PreviewPlayer } from "./PreviewPlayer";
import { CharacterPanel, type CharacterData } from "./CharacterPanel";
import { BrandKitPanel } from "./BrandKitPanel";
import {
  ASPECTS,
  DEFAULT_ASPECT,
  type Aspect,
  type BrandKit,
  type BrandTemplate,
  type TimelineClip,
} from "@/remotion/durationUtils";

const POLL_INTERVAL_MS = 3000;
const STYLE_LOCK_DEBOUNCE_MS = 600;
const CAPTION_DEBOUNCE_MS = 500;

export function StudioClient({
  projectId,
  projectName,
  initialClips,
  initialCharacters,
  initialStyleLock,
  initialBrandLogoUrl,
  initialCtaText,
  initialTemplate,
}: {
  projectId: string;
  projectName: string;
  initialClips: ClipData[];
  initialCharacters: CharacterData[];
  initialStyleLock: string | null;
  initialBrandLogoUrl: string | null;
  initialCtaText: string | null;
  initialTemplate: BrandTemplate;
}) {
  const [clips, setClips] = useState<ClipData[]>(initialClips);
  const [characters, setCharacters] = useState<CharacterData[]>(initialCharacters);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [styleLock, setStyleLock] = useState(initialStyleLock ?? "");
  const [brandLogoUrl, setBrandLogoUrl] = useState(initialBrandLogoUrl);
  const [ctaText, setCtaText] = useState(initialCtaText ?? "");
  const [template, setTemplate] = useState<BrandTemplate>(initialTemplate);
  const [aspect, setAspect] = useState<Aspect>(DEFAULT_ASPECT);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const trimTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const captionTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const styleLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaTextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleCaptionChange(clipId: string, caption: string) {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, caption } : c)));

    const existing = captionTimers.current.get(clipId);
    if (existing) clearTimeout(existing);
    captionTimers.current.set(
      clipId,
      setTimeout(() => {
        fetch(`/api/clips/${clipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption }),
        }).catch(() => {});
      }, CAPTION_DEBOUNCE_MS)
    );
  }

  function handleDelete(clipId: string) {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    fetch(`/api/clips/${clipId}`, { method: "DELETE" }).catch(() => {});
  }

  function handleStyleLockChange(value: string) {
    setStyleLock(value);
    if (styleLockTimer.current) clearTimeout(styleLockTimer.current);
    styleLockTimer.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleLock: value || null }),
      }).catch(() => {});
    }, STYLE_LOCK_DEBOUNCE_MS);
  }

  function handleCtaTextChange(value: string) {
    setCtaText(value);
    if (ctaTextTimer.current) clearTimeout(ctaTextTimer.current);
    ctaTextTimer.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctaText: value || null }),
      }).catch(() => {});
    }, STYLE_LOCK_DEBOUNCE_MS);
  }

  function handleTemplateChange(value: BrandTemplate) {
    setTemplate(value);
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: value }),
    }).catch(() => {});
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportUrl(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect }),
      });
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
      caption: c.caption,
    }));

  const brand: BrandKit = { logoUrl: brandLogoUrl, ctaText, template };

  const selectedCharacterName =
    characters.find((c) => c.id === selectedCharacterId)?.name ?? null;

  return (
    <div className="studio">
      <PreviewPlayer clips={completedClips} brand={brand} projectName={projectName} />

      <Timeline
        clips={clips}
        onReorder={handleReorder}
        onTrimChange={handleTrimChange}
        onTransitionChange={handleTransitionChange}
        onCaptionChange={handleCaptionChange}
        onDelete={handleDelete}
      />

      <label className="style-lock">
        World style lock
        <input
          type="text"
          placeholder="e.g. shot on 35mm, teal-and-orange grade, neon rim light"
          value={styleLock}
          onChange={(e) => handleStyleLockChange(e.target.value)}
        />
      </label>

      <CharacterPanel
        projectId={projectId}
        characters={characters}
        selectedId={selectedCharacterId}
        onSelect={setSelectedCharacterId}
        onCreated={(c) => setCharacters((prev) => [...prev, c])}
      />

      <GeneratePanel
        onGenerate={handleGenerate}
        disabled={false}
        selectedCharacterId={selectedCharacterId}
        selectedCharacterName={selectedCharacterName}
      />

      <BrandKitPanel
        projectId={projectId}
        logoUrl={brandLogoUrl}
        ctaText={ctaText}
        template={template}
        onLogoUploaded={setBrandLogoUrl}
        onCtaTextChange={handleCtaTextChange}
        onTemplateChange={handleTemplateChange}
      />

      <div className="export-row">
        <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
          {Object.keys(ASPECTS).map((a) => (
            <option key={a} value={a}>
              {a} {a === "9:16" ? "(Reels/TikTok)" : a === "1:1" ? "(Feed)" : "(YouTube)"}
            </option>
          ))}
        </select>
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
