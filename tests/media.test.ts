import { it, expect } from "vitest";
import { providerUrl } from "../lib/safe-download";
it("rejects arbitrary URLs, credentials, alternate ports and non-HTTPS before downloading", () => {
  const hosts = ["cdn.example.com"];
  for (const url of ["http://cdn.example.com/a", "https://evil.example/a", "https://127.0.0.1/a", "https://user:pass@cdn.example.com/a", "https://cdn.example.com:8443/a", "https://cdn.example.com.evil/a"]) expect(() => providerUrl(url, hosts)).toThrow();
  expect(providerUrl("https://cdn.example.com/a.mp4", hosts).hostname).toBe("cdn.example.com");
});

