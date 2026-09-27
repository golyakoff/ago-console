import { describe, expect, it, vi } from "vitest";
import { ApiProblemError } from "../api/problemDetails.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";
import { shapeMismatchMessage } from "./apiErrorMessage.js";

// `shapeMismatchMessage` itself pulls in no `config.ts`; `ApiProblemError` (`problemDetails.js`) is
// deliberately environment-free (its own doc comment). The mock is kept only so the module graph
// loads identically to every other `pages/*` test in this console.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

/**
 * `23-118`: the chat-side surfacing half of "validate at every API boundary" (`23-41`). A chat reader
 * rejects a mis-shaped response with `ApiProblemError('shape.mismatch', <endpoint+field diagnostic>)`
 * (or the `CannedResponsesError`/`ReplyDraftError` twin - all three carry the same `code`); this helper
 * is what a screen's `catch` reaches for so the viewer sees a localized "couldn't load this", carrying
 * the endpoint/field to identify what disagreed - never the raw English `ShapeMismatchError` sentence.
 */
describe("shapeMismatchMessage - 23-118", () => {
  const diagnostic = "GET /api/v1/conversations/all: conversationId";

  it("returns the localized frame in English, with the endpoint+field diagnostic appended", () => {
    const message = shapeMismatchMessage(new ApiProblemError("shape.mismatch", diagnostic, 200), en);

    expect(message).toContain(en.shapeMismatchError);
    expect(message).toContain(diagnostic);
  });

  it("returns the localized frame in Russian for the identical error", () => {
    const message = shapeMismatchMessage(new ApiProblemError("shape.mismatch", diagnostic, 200), ru);

    expect(message).toContain(ru.shapeMismatchError);
    expect(message).toContain(diagnostic);
    // The two locales must not resolve to the same sentence - proves the string is actually localized.
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });

  it("localizes any error carrying code 'shape.mismatch', not only ApiProblemError - the CannedResponses/ReplyDraft twins", () => {
    // `CannedResponsesError`/`ReplyDraftError` share no base with `ApiProblemError` beyond `Error`; the
    // duck-typed `code` check is the whole contract. Built by hand here so this test needs neither
    // `config.ts` nor either of those modules.
    const cannedLike = Object.assign(new Error(diagnostic), { code: "shape.mismatch" });

    expect(shapeMismatchMessage(cannedLike, en)).toContain(en.shapeMismatchError);
  });

  it("returns null for any other failure, so a caller keeps its own unknown-error wording", () => {
    expect(shapeMismatchMessage(new ApiProblemError("Conversation.Forbidden", "no", 403), en)).toBeNull();
    expect(shapeMismatchMessage(new Error("network down"), en)).toBeNull();
    expect(shapeMismatchMessage("not even an error", en)).toBeNull();
  });
});
