import { describe, expect, it } from "vitest";
import { isValidEntryPointUrl, parseTriggerWords, validateModuleDraft } from "./moduleConfigValidation.js";

/**
 * `19-03`: the console's own pre-flight check for the module-registration form. Deliberately tested
 * as pure functions rather than through the page - `offlineAutoReplyValidation.test.ts`'s own doc
 * comment states the identical reasoning: what a reviewer needs to see is that these rules are a
 * client-side convenience, not that a form renders.
 */
describe("parseTriggerWords", () => {
  it("splits on commas and trims each word", () => {
    expect(parseTriggerWords("/faq, /помощь")).toEqual(["/faq", "/помощь"]);
  });

  it("splits on newlines too", () => {
    expect(parseTriggerWords("/faq\n/помощь")).toEqual(["/faq", "/помощь"]);
  });

  it("drops blank entries from repeated separators or trailing commas", () => {
    expect(parseTriggerWords("/faq,, /помощь,")).toEqual(["/faq", "/помощь"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseTriggerWords("   ")).toEqual([]);
    expect(parseTriggerWords("")).toEqual([]);
  });

  it("returns a single-entry array for one trigger word with no separator", () => {
    expect(parseTriggerWords("/faq")).toEqual(["/faq"]);
  });
});

describe("isValidEntryPointUrl", () => {
  it("accepts an absolute https:// URL", () => {
    expect(isValidEntryPointUrl("https://faq.example.com")).toBe(true);
  });

  it("rejects plain http://", () => {
    expect(isValidEntryPointUrl("http://faq.example.com")).toBe(false);
  });

  it("rejects a relative path", () => {
    expect(isValidEntryPointUrl("/faq")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEntryPointUrl("")).toBe(false);
  });

  it("rejects a value with no scheme at all", () => {
    expect(isValidEntryPointUrl("faq.example.com")).toBe(false);
  });
});

describe("validateModuleDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateModuleDraft("faq", ["/faq"], "https://faq.example.com")).toBeNull();
  });

  it("reports a blank module key", () => {
    expect(validateModuleDraft("  ", ["/faq"], "https://faq.example.com")).not.toBeNull();
  });

  it("reports no trigger words", () => {
    expect(validateModuleDraft("faq", [], "https://faq.example.com")).not.toBeNull();
  });

  it("reports a blank entry point", () => {
    expect(validateModuleDraft("faq", ["/faq"], "  ")).not.toBeNull();
  });

  it("reports a non-https entry point", () => {
    expect(validateModuleDraft("faq", ["/faq"], "http://faq.example.com")).not.toBeNull();
  });
});
