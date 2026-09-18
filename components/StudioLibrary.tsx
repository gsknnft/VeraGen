"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export function StudioLibrary({ projects }: { projects: { id: string; name: string; updatedAt: string }[] }) {
  const router = useRouter(); const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [name,setName] = useState("");
  return <><form className="generate-panel" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "Untitled social video" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.push(`/studio/${data.id}`); }
    catch { setError("Could not create your project. Please try again."); setBusy(false); }
  }}><label>What are you making?<input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Product launch, character reveal, brand story…" /></label><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create a social video"}</button></form>
  {error && <p role="alert">{error}</p>}
  <h2>Your projects</h2>{projects.length ? <div className="project-library">{projects.map(project => <Link className="project-card" key={project.id} href={`/studio/${project.id}`}><strong>{project.name}</strong><span>{new Date(project.updatedAt).toLocaleDateString()}</span><span>Continue editing →</span></Link>)}</div> : <p>Your first finished video starts with an image or an idea.</p>}</>;
}

