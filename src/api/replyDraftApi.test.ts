import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyDraftError, generateReplyDraft } from "./replyDraftApi.js";

/**
 * `23-118`/`23-99`: `generateReplyDraft`'s `draftText` is inserted into the composer, so a dropped
 * `draftText` would insert nothing and read as "no suggestion generated" - a false empty state.
 * Rejected as `ReplyDraftError('shape.mismatch')`, the same `code`-carrying type every other rejection
 * here produces, which `shapeMismatchMessage` localizes.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateReplyDraft - shape validation", () => {
  it("resolves when draftText is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { draftText: "Thanks for reaching out!" }));

    await expect(generateReplyDraft("token", "c1")).resolves.toEqual({ draftText: "Thanks for reaching out!" });
  });

  it("throws ReplyDraftError('shape.mismatch') when draftText is dropped", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await generateReplyDraft("token", "c1").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ReplyDraftError);
    expect((failure as ReplyDraftError).code).toBe("shape.mismatch");
    expect((failure as ReplyDraftError).message).toContain("draftText");
  });
});
