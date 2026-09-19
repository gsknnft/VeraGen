"use client";

import { useEffect, useState } from "react";

export function SharePlayer({
  title,
  posterSrc,
  videoSrc: initialVideoSrc,
  pageUrl,
  ready: initiallyReady,
}: {
  title: string;
  posterSrc: string | null;
  videoSrc: string | null;
  pageUrl: string;
  ready: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [videoSrc, setVideoSrc] = useState(initialVideoSrc);
  const [ready, setReady] = useState(initiallyReady);

  // Public page: if the clip was still processing at SSR time, poll the same
  // media URL until the share's video is attached (status routes already sync it).
  useEffect(() => {
    if (ready) return;
    const token = pageUrl.split("/").pop();
    if (!token) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/share/${token}/media?kind=video`, { method: "GET", redirect: "manual" });
        // 307/302 to signed URL, or 200 — anything but 404 means video exists.
        if (res.status === 404 || res.status === 503) return;
        if (res.status >= 300 && res.status < 400) {
          setVideoSrc(`/api/share/${token}/media?kind=video`);
          setReady(true);
        } else if (res.ok) {
          setVideoSrc(`/api/share/${token}/media?kind=video`);
          setReady(true);
        }
      } catch { /* ignore transient */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [ready, pageUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="share-player">
      {videoSrc ? (
        <video
          className="share-video"
          src={videoSrc}
          poster={posterSrc ?? undefined}
          controls
          playsInline
          loop
          muted
          autoPlay
        />
      ) : posterSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="share-video" src={posterSrc} alt={title} />
      ) : (
        <div className="share-video processing">Preparing…</div>
      )}
      {!ready && <p className="hint">Still rendering — this link already unfurls with the poster. Playback appears here when ready.</p>}
      <div className="export-row">
        <input className="share-url" readOnly value={pageUrl} aria-label="Share URL" onFocus={(e) => e.target.select()} />
        <button type="button" className="primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </section>
  );
}
