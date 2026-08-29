import { describe, expect, it } from "vitest";
import {
  MAX_BODY_LENGTH,
  MAX_RESPONSES,
  MAX_TITLE_LENGTH,
  meaningfulResponses,
  toRequestResponses,
  validateDraft,
} from "./cannedResponsesValidation.js";

/**
 * `18-03`: the console's own pre-flight check. Deliberately tested as a pure function rather than
 * through the page - what a reviewer needs to see is that the rules it enforces are the server's own
 * (`CannedResponse`, `ago-chat`), not that a form renders.
 */
describe("the canned-responses draft", () => {
  it("allows an empty list", () => {
    expect(validateDraft([])).toBeNull();
  });

  it("ignores the blank row the editor always keeps at the bottom", () => {
    expect(validateDraft([{ title: "", body: "" }])).toBeNull();
    expect(meaningfulResponses([{ title: "", body: "" }])).toHaveLength(0);
  });

  it("reports a half-filled response rather than silently dropping it", () => {
    expect(validateDraft([{ title: "Refund policy", body: "  " }])).not.toBeNull();
    expect(validateDraft([{ title: " ", body: "Three working days." }])).not.toBeNull();
  });

  it("enforces the server's own caps", () => {
    const tooMany = Array.from({ length: MAX_RESPONSES + 1 }, (_, i) => ({ title: `Title ${i}`, body: "Reply." }));
    expect(validateDraft(tooMany)).not.toBeNull();

    expect(
      validateDraft([{ title: "t".repeat(MAX_TITLE_LENGTH + 1), body: "Reply." }]),
    ).not.toBeNull();
    expect(
      validateDraft([{ title: "Refund policy", body: "x".repeat(MAX_BODY_LENGTH + 1) }]),
    ).not.toBeNull();
  });

  it("sends trimmed titles, drops blank rows, and keeps the operator's order", () => {
    const request = toRequestResponses([
      { title: "  Greeting ", body: "Hi there." },
      { title: "", body: "" },
      { title: "Refund policy", body: "Three days." },
    ]);

    expect(request).toEqual([
      { title: "Greeting", body: "Hi there." },
      { title: "Refund policy", body: "Three days." },
    ]);
  });

  it("does not trim the body - it is inserted verbatim, unlike the title", () => {
    const request = toRequestResponses([{ title: "Greeting", body: "  Hi there.  " }]);

    expect(request).toEqual([{ title: "Greeting", body: "  Hi there.  " }]);
  });
});
