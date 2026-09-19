import { it, expect } from "vitest";
import { providerUrl } from "../lib/safe-download";
it("rejects arbitrary URLs, credentials, alternate ports and non-HTTPS before downloading", () => {
  const hosts = ["cdn.example.com"];
  for (const url of ["http://cdn.example.com/a", "https://evil.example/a", "https://127.0.0.1/a", "https://user:pass@cdn.example.com/a", "https://cdn.example.com:8443/a", "https://cdn.example.com.evil/a"]) expect(() => providerUrl(url, hosts)).toThrow();
  expect(providerUrl("https://cdn.example.com/a.mp4", hosts).hostname).toBe("cdn.example.com");
});


it("names the unapproved result host for the operator, without logging the bearer URL", async () => {
  const { downloadProviderVideo, UnapprovedMediaHost } = await import("../lib/safe-download");
  const { vi } = await import("vitest");
  const previous = process.env.HIGGSFIELD_MEDIA_HOSTS;
  process.env.HIGGSFIELD_MEDIA_HOSTS = "cdn.example.com";
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const secretUrl = "https://results.provider.example/v/abc.mp4?Signature=SECRET&Expires=1";
    const err = await downloadProviderVideo(secretUrl).catch(e => e);
    expect(err).toBeInstanceOf(UnapprovedMediaHost);
    expect(err.hostname).toBe("results.provider.example");
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("results.provider.example");
    expect(logged).toContain("HIGGSFIELD_MEDIA_HOSTS");
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("/v/abc.mp4");
  } finally {
    warn.mockRestore();
    process.env.HIGGSFIELD_MEDIA_HOSTS = previous;
  }
});
