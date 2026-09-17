"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";

interface CollectionSummary {
  id: string;
  name: string;
  createdAt: string;
}

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then(setCollections);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/collections/${data.id}`);
  }

  return (
    <main>
      <NavBar active="collections" />
      <h1>Collections</h1>
      <p className="subtitle">
        Trait-based generative sets — define traits once, mint unique,
        reproducible assets one at a time.
      </p>

      <form className="generate-panel" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="e.g. BittyDragons"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: "#141414",
            color: "#f2f2f2",
            border: "1px solid #333",
            borderRadius: 10,
            padding: 12,
          }}
        />
        <button className="primary" type="submit" disabled={creating}>
          {creating ? "Creating…" : "New collection"}
        </button>
      </form>

      <div className="character-row" style={{ flexWrap: "wrap" }}>
        {collections.map((c) => (
          <a
            key={c.id}
            href={`/collections/${c.id}`}
            className="character-chip"
            style={{ textDecoration: "none" }}
          >
            {c.name}
          </a>
        ))}
      </div>
    </main>
  );
}
