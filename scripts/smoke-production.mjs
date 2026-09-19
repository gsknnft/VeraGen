import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

// Exercise the built server without connecting to any configured real database.
const port = 4180;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  windowsHide: true, stdio: "ignore",
  env: { ...process.env, NODE_ENV: "production", NEXT_PHASE: "", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
    BETTER_AUTH_URL: "https://veragen.example", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    // Deliberately present: production must ignore the development bypass.
    VERAGEN_DEV_USER: "must-not-be-used@example.invalid",
    GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  },
});
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error("Production smoke server exited before readiness.");
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await sleep(500);
  }
  assert.ok(ready, "Production server did not become ready.");
  const home = await fetch(base);
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  for (const path of ["/api/projects", "/api/collections", "/api/projects/not-owned", "/api/clips/not-owned/status", "/api/media/not-owned", "/api/higgsfield/connection"]) {
    assert.equal((await fetch(base + path)).status, 401, path);
  }
  for (const path of ["/studio", "/studio/not-owned", "/collections"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.ok([303, 307].includes(response.status), path);
    assert.ok(response.headers.get("location")?.endsWith("/sign-in"), path);
  }
  assert.equal((await fetch(base + "/sign-in")).status, 200);
  console.log("Production HTTP smoke passed: private routes reject signed-out users, pages redirect, security headers exist, and the dev bypass is ignored.");
} finally { child.kill(); }
