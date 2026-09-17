"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";

const STORAGE_KEY = "loopface:lastProjectId";
export default function StudioEntry() {
  const router = useRouter();
  const [existing, setExisting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => { try { const id = localStorage.getItem(STORAGE_KEY); if (id && /^[a-zA-Z0-9_-]+$/.test(id)) setExisting(id); } catch { /* Storage is optional. */ } }, []);
  async function open(resume: boolean) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (resume && existing) {
        const check = await fetch(`/api/projects/${encodeURIComponent(existing)}`);
        if (check.ok) { router.push(`/studio/${encodeURIComponent(existing)}`); return; }
        if (check.status !== 404) throw new Error("Your project could not be opened. Please try again.");
        setExisting(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* Optional. */ }
        throw new Error("That project is no longer available. You can start a new one.");
      }
      const response = await fetch("/api/projects", { method: "POST" });
      if (!response.ok) throw new Error("The studio could not create a project. Please try again.");
      const data = await response.json();
      if (typeof data.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(data.id)) throw new Error("The studio returned an invalid project.");
      try { localStorage.setItem(STORAGE_KEY, data.id); } catch { /* Navigation still works. */ }
      router.push(`/studio/${encodeURIComponent(data.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reach the studio."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="studio-entry"><Brand /><div className="entry-art" /><p className="eyebrow">YOUR NEXT FRAME</p><h1>Make room for an idea.</h1><p className="subtitle">Start a fresh edit or return to your last project.</p>{existing && <button className="primary" disabled={busy} onClick={() => open(true)}>Continue last project</button>}<button className={existing ? "secondary" : "primary"} disabled={busy} onClick={() => open(false)}>{busy ? "Opening studio…" : "Create a project"}</button>{error && <p className="error" role="alert">{error}</p>}</main>;
}
