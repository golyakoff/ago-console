import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkOperatorErasure, fetchMyPermissions } from "./operatorsApi.js";
import { ShapeMismatchError } from "./shapeGuard.js";

/**
 * `16-02`: `checkOperatorErasure` is `AccountDeletionPage`'s completion poll, and this file exists for
 * the same reason `problemDetails.test.ts` does - it is the wire-to-`ErasureCheckOutcome` step every
 * downstream decision (`usePollUntilErased`, `AccountDeletionPage`'s own `logout()` call) trusts
 * without re-checking. See `checkOperatorErasure`'s own doc comment for the confirmed shape: a bare
 * `403`, reusing `resolveOperatorState`'s own already-shipped "no operator row" signal - reconciled
 * against `ago-chat`'s actual `16-02` (`RequireOperatorIdentity`'s policy failure is always a bare
 * `403`, never a `404`, never a parseable problem-details code).
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

describe("checkOperatorErasure", () => {
  it("reads a normal 200 as still pending", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operatorId: "op", siteId: "site", permissions: [], locale: "En" }));

    await expect(checkOperatorErasure("token")).resolves.toBe("pending");
  });

  it("reads a bare 403 as erased - RequireOperatorIdentity's own policy-failure shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403));

    await expect(checkOperatorErasure("token")).resolves.toBe("erased");
  });

  it("reads a 403 carrying a body as erased too - the body is never inspected", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { type: "Operator.Forbidden", detail: "no" }));

    await expect(checkOperatorErasure("token")).resolves.toBe("erased");
  });

  it("does not read a bare 404 as erased - this endpoint never actually produces one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await expect(checkOperatorErasure("token")).resolves.toBe("unknown");
  });

  it("does not read a 401 as erased - a merely-expired token produces the identical status and says nothing about the row", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401));

    await expect(checkOperatorErasure("token")).resolves.toBe("unknown");
  });

  it("does not read a server error as erased", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    await expect(checkOperatorErasure("token")).resolves.toBe("unknown");
  });

  it("does not read a network failure as erased - indistinguishable from the wifi dropping", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkOperatorErasure("token")).resolves.toBe("unknown");
  });
});

/**
 * `23-99`: `fetchMyPermissions` is `PermissionsProvider`'s second call, and its `enabledModules`
 * field alone decides whether every calendar nav entry is shown or hidden
 * (`calendarAccess.tsx`) - this response is the console's own "does this account have anything in
 * it" answer, not one screen's. Before this item, a response missing `enabledModules` resolved
 * normally and `PermissionsProvider`'s own `enabledModules ?? []` default turned "we were not told"
 * into "there is nothing" - the exact ambiguity this item exists to close.
 */
describe("fetchMyPermissions - 23-99 shape validation", () => {
  it("resolves normally when the response carries every field this console reads from it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { operatorId: "op1", siteId: "site1", permissions: ["customer:read"], locale: "En", enabledModules: ["calendar"] }),
    );

    await expect(fetchMyPermissions("token")).resolves.toMatchObject({ enabledModules: ["calendar"] });
  });

  it("does not flag the optional credentialsArePublished as missing - it is documented absent-means-false, not a shape defect", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { operatorId: "op1", siteId: "site1", permissions: [], locale: "En", enabledModules: [] }),
    );

    await expect(fetchMyPermissions("token")).resolves.toMatchObject({ enabledModules: [] });
  });

  it("throws rather than silently resolving when enabledModules is dropped from an otherwise well-formed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operatorId: "op1", siteId: "site1", permissions: [], locale: "En" }));

    const failure = await fetchMyPermissions("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ShapeMismatchError);
    expect((failure as ShapeMismatchError).missingFields).toEqual(["enabledModules"]);
  });
});
