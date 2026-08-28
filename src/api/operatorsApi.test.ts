import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkOperatorErasure } from "./operatorsApi.js";

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
