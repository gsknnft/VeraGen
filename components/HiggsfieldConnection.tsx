"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function HiggsfieldConnection() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/higgsfield/connection").then(r => r.json()).then(data => setConnected(data.connected)).catch(() => setMessage("Could not check connection.")); }, []);
  return <details className="higgsfield-connection"><summary>{connected ? "Higgsfield · your credits" : "Connect Higgsfield"}</summary><div className="higgsfield-connection-panel">
    <p>Use your own Higgsfield API account. Generation uses your API credits. VeraGen never substitutes its own key.</p>
    <p>Credentials expire after eight hours. Connecting does not generate anything or verify your balance.</p>
    <a href="https://console.higgsfield.ai" target="_blank" rel="noreferrer">Manage your Higgsfield account</a>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      const form = event.currentTarget;
      const data = new FormData(form);
      try {
        const response = await fetch("/api/higgsfield/connection", { method: connected ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: connected ? undefined : JSON.stringify({ id: data.get("id"), secret: data.get("secret") }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setConnected(result.connected); form.reset(); router.refresh();
        setMessage(result.connected ? "Connected for this browser session. Generating will use your credits." : "Disconnected.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed."); }
      finally { setBusy(false); }
    }}>
      {!connected && <><label>API key ID<input name="id" type="password" required autoComplete="off" maxLength={512} /></label><label>API secret<input name="secret" type="password" required autoComplete="off" maxLength={512} /></label></>}
      <button disabled={busy}>{busy ? "Saving…" : connected ? "Disconnect" : "Connect my account"}</button>
    </form><p role="status">{message}</p></div>
  </details>;
}
