"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export function AccountMenu() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  return <><button disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      await fetch("/api/higgsfield/connection", { method: "DELETE" });
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      localStorage.removeItem("loopface:lastProjectId");
      window.location.assign("/sign-in");
    } catch { setError("Could not sign out. Try again."); setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <span role="alert">{error}</span>}</>;
}

