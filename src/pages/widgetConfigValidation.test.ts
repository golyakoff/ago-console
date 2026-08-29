import { describe, expect, it } from "vitest";
import { isValidHexColor, isValidNoticeUrl } from "./widgetConfigValidation.js";

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

describe("isValidNoticeUrl", () => {
  it("accepts an absolute https:// URL", () => {
    expect(isValidNoticeUrl("https://tenant.example/privacy")).toBe(true);
  });

  it("rejects plain http://", () => {
    expect(isValidNoticeUrl("http://tenant.example/privacy")).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    expect(isValidNoticeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects a relative path", () => {
    expect(isValidNoticeUrl("/privacy")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidNoticeUrl("")).toBe(false);
  });

  it("rejects a value with no scheme at all", () => {
    expect(isValidNoticeUrl("tenant.example/privacy")).toBe(false);
  });
});
