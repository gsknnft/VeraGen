"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "loopface:lastProjectId";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      router.replace(`/studio/${existing}`);
      return;
    }
    fetch("/api/projects", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        localStorage.setItem(STORAGE_KEY, data.id);
        router.replace(`/studio/${data.id}`);
      });
  }, [router]);

  return (
    <main>
      <p className="subtitle">Opening your studio…</p>
    </main>
  );
}
