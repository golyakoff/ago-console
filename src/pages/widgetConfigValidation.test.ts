import { describe, expect, it } from "vitest";
import { isValidHexColor } from "./widgetConfigValidation.js";

describe("isValidHexColor", () => {
  it("accepts a well-formed six-digit hex color", () => {
    expect(isValidHexColor("#2F6FED")).toBe(true);
  });

  it("accepts lowercase hex digits", () => {
    expect(isValidHexColor("#2f6fed")).toBe(true);
  });

  it("rejects a missing #", () => {
    expect(isValidHexColor("2F6FED")).toBe(false);
  });

  it("rejects a three-digit shorthand", () => {
    expect(isValidHexColor("#2FE")).toBe(false);
  });

  it("rejects a non-hex character", () => {
    expect(isValidHexColor("#2F6FEZ")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidHexColor("")).toBe(false);
  });
});
