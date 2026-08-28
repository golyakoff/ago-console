import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkConversationErasure, eraseConversation } from "./conversationsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `16-02`. Split from a would-be `conversationsApi.test.ts` (this file is the first test for anything
 * in `conversationsApi.ts`, which had none before this item) into its own file named for the feature
 * rather than the module, since everything here is this item's own addition and nothing here touches
 * `fetchOperatorQueue`/`fetchAllConversationsForSite`/`markConversationRead`/`closeConversation`.
 *
 * `checkConversationErasure`'s own doc comment has the full account of the one place this item's
 * handed-down contract does not match this repository: there is no confirmed single-conversation `GET`
 * endpoint in `ago-chat` today, so the route asserted below (`GET /api/v1/conversations/{id}`) is this
 * worker's own best guess, not a verified contract.
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
const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";

function jsonResponse(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/problem+json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("eraseConversation", () => {
  it("posts to the erase route and resolves on 202 Accepted, without waiting for real deletion", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202));

    await eraseConversation("token", CONVERSATION_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test.invalid/api/v1/conversations/${CONVERSATION_ID}/erase`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiProblemError, not a bare success, for anything other than 202", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { type: "Conversation.Forbidden", detail: "no" }));

    await expect(eraseConversation("token", CONVERSATION_ID)).rejects.toBeInstanceOf(ApiProblemError);
  });
});

describe("checkConversationErasure", () => {
  it("reads a normal 200 as still pending", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversationId: CONVERSATION_ID }));

    await expect(checkConversationErasure("token", CONVERSATION_ID)).resolves.toBe("pending");
  });

  it("reads a 404 as erased", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await expect(checkConversationErasure("token", CONVERSATION_ID)).resolves.toBe("erased");
  });

  it("does not read a 403 as erased - only a 404 means gone here", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403));

    await expect(checkConversationErasure("token", CONVERSATION_ID)).resolves.toBe("unknown");
  });

  it("does not read a network failure as erased", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkConversationErasure("token", CONVERSATION_ID)).resolves.toBe("unknown");
  });
});
