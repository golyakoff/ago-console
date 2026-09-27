import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPendingOperatorInvite, previewOperatorInvite } from "./operatorInvitesApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { ShapeMismatchError } from "./shapeGuard.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the two readers here.
 * - `previewOperatorInvite` is a POST in transport but a pure read; a dropped `status` renders as a
 *   blank invite card (no branch matches), rethrown as `ApiProblemError('shape.mismatch')` so the page's
 *   generic error alert shows instead.
 * - `hasPendingOperatorInvite` drops `hasPendingInvite` and reads as false ("no invite"); thrown as a
 *   plain `ShapeMismatchError` because `OnboardingPage`'s effect swallows every rejection (no
 *   localized-surfacing path), matching `siteSuspensionApi.ts`.
 * The three POST writes (`redeemOperatorInvite`, `redeemPendingOperatorInviteForMe`) are out of scope.
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

function without(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const preview = {
  siteName: "Acme",
  invitedByDisplayName: "Ada",
  expiresAt: "2026-01-01T00:00:00Z",
  status: "Valid" as const,
};

describe("previewOperatorInvite - shape validation", () => {
  it("resolves a well-formed preview", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, preview));

    await expect(previewOperatorInvite("abc")).resolves.toEqual(preview);
  });

  it("resolves when the optional-null invitedByDisplayName is present as null - null is not absent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...preview, invitedByDisplayName: null }));

    await expect(previewOperatorInvite("abc")).resolves.toMatchObject({ invitedByDisplayName: null });
  });

  it("throws shape.mismatch when status is dropped - the card would render blank", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, without(preview, "status")));

    const failure = await caught(previewOperatorInvite("abc"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("status");
  });
});

describe("hasPendingOperatorInvite - shape validation", () => {
  it("resolves a well-formed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { hasPendingInvite: true }));

    await expect(hasPendingOperatorInvite("token")).resolves.toEqual({ hasPendingInvite: true });
  });

  it("throws a plain ShapeMismatchError when hasPendingInvite is dropped - it would read as false", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(hasPendingOperatorInvite("token"));

    expect(failure).toBeInstanceOf(ShapeMismatchError);
    expect((failure as ShapeMismatchError).missingFields).toEqual(["hasPendingInvite"]);
  });
});
