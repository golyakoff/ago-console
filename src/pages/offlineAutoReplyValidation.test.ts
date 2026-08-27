import { describe, expect, it } from "vitest";
import {
  MAX_KEYWORD_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_RULES,
  meaningfulRules,
  toRequestRules,
  validateDraft,
} from "./offlineAutoReplyValidation.js";

/**
 * `14-04`: the console's own pre-flight check. Deliberately tested as a pure function rather than
 * through the page - what a reviewer needs to see is that the rules it enforces are the server's own
 * (`OfflineAutoReplySettings`/`OfflineAutoReplyRule`, `ago-chat`), not that a form renders.
 */
describe("the offline auto-reply draft", () => {
  it("refuses to enable an auto-reply with nothing to say", () => {
    expect(validateDraft(true, "   ", [])).not.toBeNull();
  });

  it("allows turning it off without a default reply", () => {
    expect(validateDraft(false, "", [])).toBeNull();
  });

  it("ignores the blank row the editor always keeps at the bottom", () => {
    expect(validateDraft(true, "We are closed.", [{ keyword: "", reply: "" }])).toBeNull();
    expect(meaningfulRules([{ keyword: "", reply: "" }])).toHaveLength(0);
  });

  it("reports a half-filled rule rather than silently dropping it", () => {
    expect(validateDraft(true, "We are closed.", [{ keyword: "refund", reply: "  " }])).not.toBeNull();
    expect(validateDraft(true, "We are closed.", [{ keyword: " ", reply: "Three days." }])).not.toBeNull();
  });

  it("enforces the server's own caps", () => {
    const tooMany = Array.from({ length: MAX_RULES + 1 }, (_, i) => ({ keyword: `k${i}`, reply: "r" }));
    expect(validateDraft(true, "Closed.", tooMany)).not.toBeNull();

    expect(validateDraft(true, "x".repeat(MAX_REPLY_LENGTH + 1), [])).not.toBeNull();
    expect(
      validateDraft(true, "Closed.", [{ keyword: "k".repeat(MAX_KEYWORD_LENGTH + 1), reply: "r" }]),
    ).not.toBeNull();
  });

  it("sends trimmed keywords, drops blank rows, and keeps the operator's order", () => {
    const request = toRequestRules([
      { keyword: "  delivery ", reply: "Two days." },
      { keyword: "", reply: "" },
      { keyword: "refund", reply: "Three days." },
    ]);

    // Order is behaviour, not presentation: the server matches first-rule-wins.
    expect(request).toEqual([
      { keyword: "delivery", reply: "Two days." },
      { keyword: "refund", reply: "Three days." },
    ]);
  });
});
