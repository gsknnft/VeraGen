import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

describe("Make growth tabs", () => {
  it("exposes Hold / Upload / Generate entry tabs and reuses share + make APIs", () => {
    const wizard = readFileSync(join(root, "components/MakeWizard.tsx"), "utf8");
    expect(wizard).toContain('id: "hold"');
    expect(wizard).toContain('id: "upload"');
    expect(wizard).toContain('id: "generate"');
    expect(wizard).toContain('Hold a token');
    expect(wizard).toContain('Upload a clip');
    expect(wizard).toContain("/api/make/start");
    expect(wizard).toContain("/api/make/generate");
    expect(wizard).toContain("/api/shares");
    expect(wizard).toContain("/api/projects/");
    expect(wizard).toContain("uploads/complete");
    // No ApeFathers hard-gate — demo filter is optional.
    expect(wizard).toMatch(/optional filter/i);
    expect(wizard).not.toMatch(/ApeFathers only/i);
  });

  it("does not invent Higgsfield or Alchemy secrets", () => {
    const gen = readFileSync(join(root, "app/api/make/generate/route.ts"), "utf8");
    expect(gen).toContain("getHiggsfieldCredentials");
    expect(gen).toContain("trialConfig");
    expect(gen).not.toMatch(/ALCHEMY_API_KEY\s*=/);
    expect(gen).not.toMatch(/HF_API_KEY\s*=/);
    expect(gen).toContain("createShareLink");
    expect(gen).toContain("sharePageUrl");
  });
});
