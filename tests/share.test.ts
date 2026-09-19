import { it, expect } from "vitest";
import { parseMediaId, newShareToken } from "../lib/share";
import { demoCollections } from "../lib/demo-collections";

it("parses private media references and rejects junk", () => {
  expect(parseMediaId("/api/media/abc123")).toBe("abc123");
  expect(parseMediaId("/api/media/cuid_with-dash")).toBe("cuid_with-dash");
  expect(parseMediaId("https://cdn.example/x")).toBeNull();
  expect(parseMediaId(null)).toBeNull();
});

it("mints unguessable share tokens", () => {
  const a = newShareToken();
  const b = newShareToken();
  expect(a).not.toBe(b);
  expect(a.length).toBeGreaterThanOrEqual(30);
});

it("demo collections are optional and never invent a hard gate", () => {
  const prev = process.env.VERAGEN_DEMO_COLLECTIONS;
  try {
    delete process.env.VERAGEN_DEMO_COLLECTIONS;
    expect(demoCollections()).toEqual([]);
    process.env.VERAGEN_DEMO_COLLECTIONS = "ethereum:0x0000000000000000000000000000000000000001:ApeFathers";
    expect(demoCollections()).toEqual([
      { network: "ethereum", contract: "0x0000000000000000000000000000000000000001", label: "ApeFathers" },
    ]);
    process.env.VERAGEN_DEMO_COLLECTIONS = "bad";
    expect(demoCollections()).toEqual([]);
  } finally {
    if (prev === undefined) delete process.env.VERAGEN_DEMO_COLLECTIONS;
    else process.env.VERAGEN_DEMO_COLLECTIONS = prev;
  }
});
