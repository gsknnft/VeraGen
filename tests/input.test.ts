import { it, expect } from "vitest";
import { validJsonInput } from "../lib/input";
it("rejects malformed, oversized and non-finite edit fields", () => {
  for (const value of [null, [], { caption: {} }, { caption: "a".repeat(241) }, { trimStart: -1 }, { trimEnd: Infinity }, { weight: 0 }, { order: 0.5 }]) expect(validJsonInput(value)).toBe(false);
  expect(validJsonInput({ trimStart: 1, trimEnd: 4, caption: "Hello", order: 0 })).toBe(true);
});

