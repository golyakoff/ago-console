import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentPenaltyError, fetchAssignmentPenalty } from "./assignmentPenaltyApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchAssignmentPenalty`. A dropped
 * `penaltySeconds` renders as a blank number field indistinguishable from a site with no penalty
 * configured (the false-empty case). Rethrown as `AssignmentPenaltyError('shape.mismatch')`, caught by
 * `OfflineAutoReplyPage`'s load `catch` and surfaced localized via `shapeMismatchMessage`.
 * `updateAssignmentPenalty` (a PUT echo) is out of scope.
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

function jsonResponse(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason);
}

describe("fetchAssignmentPenalty - shape validation", () => {
  it("resolves a well-formed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { penaltySeconds: 30 }));

    await expect(fetchAssignmentPenalty("token", "s-1")).resolves.toEqual({ penaltySeconds: 30 });
  });

  it("throws shape.mismatch when penaltySeconds is dropped - it would read as a blank field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(fetchAssignmentPenalty("token", "s-1"));

    expect(failure).toBeInstanceOf(AssignmentPenaltyError);
    expect((failure as AssignmentPenaltyError).code).toBe("shape.mismatch");
    expect((failure as AssignmentPenaltyError).message).toContain("penaltySeconds");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const failure = await caught(fetchAssignmentPenalty("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("assignment-penalty");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
