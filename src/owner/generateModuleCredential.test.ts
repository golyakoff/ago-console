import { describe, expect, it, vi } from "vitest";
import { generateModuleCredential } from "./generateModuleCredential.js";

/**
 * `23-94`: the grant form's own generator - see `generateModuleCredential.ts`'s own remarks for why
 * this is client-side and why `crypto.getRandomValues` needs no proof of browser support beyond what
 * `src/realtime/protocol/dedup.ts` already assumes for `crypto.randomUUID()`.
 */
describe("generateModuleCredential", () => {
  it("produces a value inside ModuleCredential's own bounds (16-256 characters)", () => {
    const value = generateModuleCredential();

    expect(value.length).toBeGreaterThanOrEqual(16);
    expect(value.length).toBeLessThanOrEqual(256);
  });

  it("produces exactly what 32 random bytes, base64-encoded, look like - openssl rand -base64 32's own shape", () => {
    const value = generateModuleCredential();

    // 32 bytes base64-encodes to 44 characters, one trailing '=' - the identical output shape
    // `openssl rand -base64 32` (the runbook's own former instruction) produces.
    expect(value).toHaveLength(44);
    expect(value.endsWith("=")).toBe(true);
    expect(value).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it("never repeats - two calls produce two different values", () => {
    const first = generateModuleCredential();
    const second = generateModuleCredential();

    expect(first).not.toBe(second);
  });

  /** `23-94`'s own disqualifying rule, checked mechanically rather than by reading the source: a
   * generator calling `Math.random()` anywhere in its path would still pass every assertion above by
   * coincidence on any single run - this is the one test that would catch it even so, by making
   * `Math.random` throw if it is ever reached at all. */
  it("never calls Math.random - only a real CSPRNG", () => {
    const mathRandomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("generateModuleCredential must never call Math.random()");
    });

    try {
      expect(() => generateModuleCredential()).not.toThrow();
    } finally {
      mathRandomSpy.mockRestore();
    }
  });

  it("draws its randomness from crypto.getRandomValues, not merely from a value that resembles it", () => {
    const getRandomValuesSpy = vi.spyOn(crypto, "getRandomValues");

    generateModuleCredential();

    expect(getRandomValuesSpy).toHaveBeenCalledTimes(1);
    expect(getRandomValuesSpy.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect((getRandomValuesSpy.mock.calls[0][0] as Uint8Array).length).toBe(32);

    getRandomValuesSpy.mockRestore();
  });
});
