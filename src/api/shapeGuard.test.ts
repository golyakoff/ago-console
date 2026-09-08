import { describe, expect, it } from "vitest";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `23-99`: the mechanism itself, independent of any one API client - `calendarApi.test.ts`/
 * `operatorsApi.test.ts`/`tenanciesApi.test.ts` each prove one real call site wires this in
 * correctly; this file proves the primitive is correct on its own terms.
 */
interface Sample {
  id: string;
  count: number;
  label: string | null;
}

const sampleKeys = requiredKeysOf<Sample>({ id: true, count: true, label: true });

describe("assertHasKeys", () => {
  it("passes a value carrying every required key, even when one is null", () => {
    expect(() => assertHasKeys<Sample>({ id: "a", count: 1, label: null }, sampleKeys, "test")).not.toThrow();
  });

  it("throws naming every missing key at once, not just the first", () => {
    let caught: unknown;
    try {
      assertHasKeys<Sample>({ id: "a" }, sampleKeys, "test");
    } catch (reason) {
      caught = reason;
    }

    expect(caught).toBeInstanceOf(ShapeMismatchError);
    expect((caught as ShapeMismatchError).missingFields).toEqual(["count", "label"]);
  });

  it("does not flag a key present with an explicit null value as missing", () => {
    expect(() => assertHasKeys<Sample>({ id: "a", count: 1, label: null }, sampleKeys, "test")).not.toThrow();
  });

  it("throws when the value is not an object at all", () => {
    expect(() => assertHasKeys<Sample>(null, sampleKeys, "test")).toThrow(ShapeMismatchError);
    expect(() => assertHasKeys<Sample>("a string", sampleKeys, "test")).toThrow(ShapeMismatchError);
    expect(() => assertHasKeys<Sample>(undefined, sampleKeys, "test")).toThrow(ShapeMismatchError);
  });
});

describe("assertArrayHasKeys", () => {
  it("passes an array whose every element carries every required key", () => {
    expect(() =>
      assertArrayHasKeys<Sample>(
        [{ id: "a", count: 1, label: null }, { id: "b", count: 2, label: "x" }],
        sampleKeys,
        "test",
      ),
    ).not.toThrow();
  });

  it("passes an empty array - a genuinely empty list is not a shape mismatch", () => {
    expect(() => assertArrayHasKeys<Sample>([], sampleKeys, "test")).not.toThrow();
  });

  it("throws when one element in the middle of the array is missing a field, not just the first or last", () => {
    let caught: unknown;
    try {
      assertArrayHasKeys<Sample>(
        [
          { id: "a", count: 1, label: null },
          { id: "b", label: null },
          { id: "c", count: 3, label: null },
        ],
        sampleKeys,
        "test",
      );
    } catch (reason) {
      caught = reason;
    }

    expect(caught).toBeInstanceOf(ShapeMismatchError);
    expect((caught as ShapeMismatchError).message).toContain("test[1]");
  });

  it("throws when the value is not an array at all", () => {
    expect(() => assertArrayHasKeys<Sample>({ id: "a" }, sampleKeys, "test")).toThrow(ShapeMismatchError);
  });
});
