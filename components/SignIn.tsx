"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export function SignIn({ github, google }: { github: boolean; google: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(provider: "github" | "google") {
    setBusy(true); setError("");
    try { const result = await authClient.signIn.social({ provider, callbackURL: "/studio" }); if (result.error) throw new Error(result.error.message); }
    catch { setError("Sign-in could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <><p>Your projects stay private. Connect your own Higgsfield account after signing in.</p>{google && <button disabled={busy} onClick={() => signIn("google")}>Continue with Google</button>}{github && <button disabled={busy} onClick={() => signIn("github")}>Continue with GitHub</button>}{!google && !github && <p role="status">Sign-in is not configured yet. The studio is closed until account setup is complete.</p>}{error && <p role="alert">{error}</p>}</>;
}
