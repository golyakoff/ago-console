import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversationNotes } from "./notesApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `23-118`/`23-99`: `fetchConversationNotes` feeds `ConversationNotesPanel`'s list, where an empty list
 * is a legitimate "no notes yet" - so a dropped field would read as that empty rather than as a reader
 * that did not answer. Rejected as `ApiProblemError('shape.mismatch')`.
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

const note = { id: "n1", authorId: "op1", body: "called back", createdAt: "2026-08-01T00:00:00Z" };

describe("fetchConversationNotes - shape validation", () => {
  it("resolves the list when every note carries its required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { notes: [note] }));

    await expect(fetchConversationNotes("token", "c1")).resolves.toEqual([note]);
  });

  it("resolves an empty list as an empty list - a conversation with no notes is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { notes: [] }));

    await expect(fetchConversationNotes("token", "c1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a note is missing authorId", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { notes: [{ id: "n1", body: "x", createdAt: "y" }] }));

    const failure = await fetchConversationNotes("token", "c1").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("authorId");
  });

  it("throws when the notes array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    expect(((await fetchConversationNotes("token", "c1").catch((r: unknown) => r)) as ApiProblemError).code).toBe("shape.mismatch");
  });
});
