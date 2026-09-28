import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiProblemError,
  fetchOperatorTeam,
  fetchSeatAssignmentSummary,
  listOperatorInvites,
} from "./operatorTeamApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the three team reads. Each is a list/count screen
 * where a dropped field and a genuinely empty result render identically - a dropped `operators`/`roles`/
 * `invites` list reads as "none", a dropped `holdsSeat`/`status` on a row reads as off/blank. Rethrown as
 * `ApiProblemError('shape.mismatch')` and surfaced localized in `OperatorsTeamPage` via
 * `shapeMismatchMessage`. The write methods are out of scope.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

vi.mock("./activeSite.js", () => ({
  withActiveSiteHeader: (headers: HeadersInit) => headers,
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

const team = {
  operators: [
    {
      operatorId: "op-1",
      displayName: "Ada",
      email: "ada@example.test",
      roles: [{ roleName: "Operator", holdsSeat: true }],
      // `26-263`: the redeemed instant this member joined through - `null` here (as it would be for
      // the founder), a real value is exercised in `OperatorsTeamPage.test.tsx`'s own status tests.
      joinedAt: null,
    },
  ],
};

const summary = {
  roles: [{ roleName: "Operator", heldSeats: 1, limit: 3, overLimit: false }],
};

const invites = {
  invites: [
    {
      operatorInviteId: "inv-1",
      email: "new@example.test",
      createdAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-08T00:00:00Z",
      status: "Sent",
      smtpErrorCode: null,
      roles: ["Operator", "Admin"],
      // `26-263`/`ago-chat#388`: the four additive fields - a still-pending invite the same "Sent"
      // fixture already described before this item, so `effectiveStatus` is `Pending` and every date
      // (including the later-added `revokedAt`) is null.
      effectiveStatus: "Pending",
      redeemedAt: null,
      removedAt: null,
      revokedAt: null,
    },
  ],
};

describe("fetchOperatorTeam - shape validation", () => {
  it("resolves a well-formed team", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, team));

    await expect(fetchOperatorTeam("token", "s-1")).resolves.toEqual(team);
  });

  it("resolves an empty operators list - no colleagues is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operators: [] }));

    await expect(fetchOperatorTeam("token", "s-1")).resolves.toEqual({ operators: [] });
  });

  it("throws shape.mismatch when a member's roles list is dropped", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operators: [without(team.operators[0], "roles")] }));

    const failure = await caught(fetchOperatorTeam("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("roles");
  });

  it("throws shape.mismatch when a nested role is missing holdsSeat, naming the index", async () => {
    const bad = { operators: [{ ...team.operators[0], roles: [{ roleName: "Operator" }] }] };
    fetchMock.mockResolvedValue(jsonResponse(200, bad));

    const failure = await caught(fetchOperatorTeam("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("holdsSeat");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  // `26-263`: `joinedAt` is a required key now (`ago-chat#387`'s own additive field, the roster's own
  // «Принято» line) - a body dropping it must be caught as a shape mismatch, not read as "no roles" the
  // way `26-258`'s own `roles` precedent above already proves for that field. Fails-before: against
  // `main`, `joinedAt` is not in `operatorTeamMemberRequiredKeys`, so this body passes the guard and the
  // missing field goes unnoticed - `OperatorsTeamPage` would then render every member as if born with no
  // "Принято" line rather than surfacing a truncated response.
  it("throws shape.mismatch when a member is missing joinedAt, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operators: [without(team.operators[0], "joinedAt")] }));

    const failure = await caught(fetchOperatorTeam("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("joinedAt");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operators: [{ operatorId: "op-1", displayName: "Ada", email: null }] }));
    const failure = await caught(fetchOperatorTeam("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("/operators");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});

describe("fetchSeatAssignmentSummary - shape validation", () => {
  it("resolves a well-formed summary", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, summary));

    await expect(fetchSeatAssignmentSummary("token", "s-1")).resolves.toEqual(summary);
  });

  it("throws shape.mismatch when a role row is missing heldSeats", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { roles: [{ roleName: "Operator", limit: 3, overLimit: false }] }));

    const failure = await caught(fetchSeatAssignmentSummary("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("heldSeats");
  });
});

describe("listOperatorInvites - shape validation", () => {
  it("resolves a well-formed invite list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, invites));

    await expect(listOperatorInvites("token", "s-1")).resolves.toEqual(invites);
  });

  it("resolves an empty invite list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [] }));

    await expect(listOperatorInvites("token", "s-1")).resolves.toEqual({ invites: [] });
  });

  it("throws shape.mismatch when an invite entry is missing status, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "status")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("status");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  // `26-258`: the new `roles` field is a required key on the entry - an invite created for a role SET
  // (`26-241`) that lists with no role information is the exact bug this item closes, so a body dropping
  // `roles` must be caught as a shape mismatch rather than rendering a role-less row. Fails-before:
  // against `main` `roles` is not in `operatorInviteListEntryRequiredKeys`, so this body passes the
  // guard and the missing field goes unnoticed.
  it("throws shape.mismatch when an invite entry is missing roles, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "roles")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("roles");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  // `26-263`: the three additive fields (`ago-chat#387`) are required keys, the same "a dropped field
  // must not silently render as an empty/false fact" reasoning the `roles`/`status` precedents above
  // already establish - `effectiveStatus` dropped would read every invite as `undefined`, which
  // `OperatorsTeamPage`'s own defensive `default` branch shows as "Unknown" rather than a load error;
  // catching it here instead is what keeps that fallback for a genuinely new *wire value*, never for a
  // genuinely truncated response. Fails-before: against `main`, none of the three is in
  // `operatorInviteListEntryRequiredKeys`, so this body passes the guard.
  it("throws shape.mismatch when an invite entry is missing effectiveStatus, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "effectiveStatus")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("effectiveStatus");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  it("throws shape.mismatch when an invite entry is missing redeemedAt, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "redeemedAt")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("redeemedAt");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  it("throws shape.mismatch when an invite entry is missing removedAt, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "removedAt")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("removedAt");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });

  // `26-263`/`ago-chat#388`: `revokedAt` joined the wire one PR after `redeemedAt`/`removedAt` - the
  // «Отозвано `<date>`» line's own field, required the same way its two siblings already are above.
  // Fails-before: against the pre-`ago-chat#388` shape, `revokedAt` is not in
  // `operatorInviteListEntryRequiredKeys`, so this body passes the guard and a truncated response would
  // render the `Revoked` card with no date rather than surfacing a load error.
  it("throws shape.mismatch when an invite entry is missing revokedAt, naming the index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { invites: [without(invites.invites[0], "revokedAt")] }));

    const failure = await caught(listOperatorInvites("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("revokedAt");
    expect((failure as ApiProblemError).message).toContain("[0]");
  });
});
