import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

/**
 * `23-22`: the team screen's own wire contracts, against `ago-chat`'s real, verified shape - not the
 * backlog item's own description of it. `GET .../operators/seat-assignment-summary` already existed
 * (`13-03`) and returns only the three aggregate numbers (`SeatAssignmentSummaryDto`); it carries no
 * per-operator rows at all, which the item's own Scope implied it did ("its rows carry names"). The
 * rows this screen needs came from a new endpoint added alongside this console change -
 * `GET /api/v1/sites/{siteId}/operators` (`GetOperatorTeamHandler`, `Ago.Chat.Api.Operators.
 * OperatorsEndpoints`) - see this item's own report for why that gap was real rather than assumed
 * away.
 */
/** `25-170`: one role this operator holds, and whether that specific `(operator, role)` pairing
 * currently holds a seat - mirrors `Ago.Chat.Application.UseCases.GetOperatorTeam.OperatorRoleSeatDto`
 * field for field. Replaces the pre-`25-170` flat `holdsSeat`/`roleNames` pair: "holds a seat" moved off
 * the operator account onto one `(operator, role)` pairing (`Operator.HoldsSeat` is gone entirely), so a
 * founder holding both seeded roles can hold one role's seat while having lost the other's. */
export interface OperatorRoleSeatDto {
  roleName: string;
  holdsSeat: boolean;
}

export interface OperatorTeamMemberDto {
  operatorId: string;
  displayName: string | null;
  email: string | null;
  /** `23-72`/`25-170`: every role this operator currently holds, each with its own seat status -
   * plural because the account's own founder holds both seeded roles at once (`RegisterSiteHandler`'s
   * own remarks), not a single "the" role. */
  roles: OperatorRoleSeatDto[];
}

export interface OperatorTeamResponseDto {
  operators: OperatorTeamMemberDto[];
}

/** `25-170`: one seeded role's own seat summary - mirrors `Ago.Chat.Application.UseCases.
 * GetSeatAssignmentSummary.RoleSeatAssignmentSummaryDto` field for field. `overLimit` is `heldSeats >
 * limit`, a derived, read-time fact (`13-03`'s own Scope), never a stored flag - distinct from the
 * *invite-time* refusal predicate (`OperatorRoleSeatCapacity.CheckAsync`'s own `heldSeats >= limit`,
 * "at capacity"), which `OperatorsTeamPage`'s own pre-invite check computes directly from `heldSeats`/
 * `limit` rather than reusing this flag - see that page's own remarks for why the two thresholds
 * answer different questions. */
export interface RoleSeatAssignmentSummaryDto {
  roleName: string;
  heldSeats: number;
  limit: number;
  overLimit: boolean;
}

/** `GetSeatAssignmentSummary.SeatAssignmentSummaryDto`'s own wire shape. `25-170`: generalises the
 * pre-`25-170` flat `heldSeats`/`seatLimit`/`overSeats` (Operator-role only) to one row per role that
 * carries a seat concept at all - always exactly the two seeded roles today (`"Operator"`, `"Admin"`),
 * in that order. */
export interface SeatAssignmentSummaryDto {
  roles: RoleSeatAssignmentSummaryDto[];
}

/** `CreateOperatorInviteEndpoints.CreateOperatorInviteResponse`'s own wire shape - `code` is the
 * plaintext invite code, present in this one response only (`OperatorInviteEndpoints`'s own remarks:
 * "shown exactly once"). `25-73`: `sendFailed` - `true` when Keycloak's own realm relay failed to
 * deliver the invite email at the SMTP layer; the invite still exists either way (it shows up in
 * `listOperatorInvites` below with its own status), so this is a warning the dialog can show
 * immediately, not a reason the create call itself failed. */
export interface CreateOperatorInviteResponseDto {
  operatorInviteId: string;
  code: string;
  expiresAt: string;
  sendFailed: boolean;
}

/** `25-73`: the console's own invite-list screen - `GET /api/v1/sites/{siteId}/operator-invites`.
 * `status` is one of `ListOperatorInvitesHandler`'s own five `OperatorInviteListStatus` members, sent
 * as its enum member name (`api-design.md`: "clients branch on `type`, never on the message").
 * `smtpErrorCode` is present only when `status === "SendFailed"`. */
export interface OperatorInviteListEntryDto {
  operatorInviteId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: "Sent" | "SendFailed" | "Revoked" | "Redeemed" | "Expired";
  smtpErrorCode: string | null;
}

export interface ListOperatorInvitesResponseDto {
  invites: OperatorInviteListEntryDto[];
}

function operatorTeamHeaders(accessToken: string, init?: RequestInit): HeadersInit {
  return withActiveSiteHeader({
    Authorization: `Bearer ${accessToken}`,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
}

/** For the two reads and the one JSON-returning write (`createOperatorInvite`) - always a `200`/`201`
 * with a body. The two `204 No Content` writes (`toggleOperatorSeat`/`removeOperator`) use their own
 * `operatorTeamVoidFetch` below instead, the same split `sitesApi.ts#eraseSite`'s own dedicated
 * `202`-checking function already draws for the identical "this call's response has no body to
 * parse" reason. */
async function operatorTeamFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: operatorTeamHeaders(accessToken, init) });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as T;
}

async function operatorTeamVoidFetch(accessToken: string, path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: operatorTeamHeaders(accessToken, init) });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

export function fetchOperatorTeam(accessToken: string, siteId: string): Promise<OperatorTeamResponseDto> {
  return operatorTeamFetch<OperatorTeamResponseDto>(accessToken, `/api/v1/sites/${siteId}/operators`);
}

export function fetchSeatAssignmentSummary(accessToken: string, siteId: string): Promise<SeatAssignmentSummaryDto> {
  return operatorTeamFetch<SeatAssignmentSummaryDto>(accessToken, `/api/v1/sites/${siteId}/operators/seat-assignment-summary`);
}

/** `23-72`: the only two role names any site has today (`RegisterSiteHandler`'s own seeding) - named
 * once here rather than as string literals scattered through the invite dialog and the role-change
 * button, the same reasoning the old `ORDINARY_ROLE_NAME` constant this replaces already had. Not an
 * enum: a role is still a name resolved server-side (`ago-chat`'s own `IRoleRepository`), never a typed
 * value this console owns. */
export const ROLE_OPERATOR = "Operator";
export const ROLE_ADMIN = "Admin";

/** `25-73`: `email` is now required by the server itself - a missing/malformed value comes back as
 * `OperatorInvite.InvalidEmail` (`400`), thrown as an `ApiProblemError` the same way every other
 * validation failure in this file already is. */
export function createOperatorInvite(
  accessToken: string,
  siteId: string,
  roleName: string,
  email: string,
): Promise<CreateOperatorInviteResponseDto> {
  return operatorTeamFetch<CreateOperatorInviteResponseDto>(accessToken, `/api/v1/sites/${siteId}/operator-invites`, {
    method: "POST",
    body: JSON.stringify({ roleName, email }),
  });
}

/** `25-73`: the invite-list table's own read - refetched by the caller (`OperatorsTeamPage`'s own
 * `load()`) after every create/revoke, the same "no separate cache, just reload" shape this file's
 * `fetchOperatorTeam` already uses for the operator table itself. */
export function listOperatorInvites(accessToken: string, siteId: string): Promise<ListOperatorInvitesResponseDto> {
  return operatorTeamFetch<ListOperatorInvitesResponseDto>(accessToken, `/api/v1/sites/${siteId}/operator-invites`);
}

/** `25-73`: the "отозвать" button's own call - `204 No Content` on success, the same
 * `operatorTeamVoidFetch` shape `toggleOperatorSeat`/`removeOperator` already use for their own
 * body-less writes. */
export function revokeOperatorInvite(accessToken: string, siteId: string, operatorInviteId: string): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operator-invites/${operatorInviteId}/revoke`, { method: "POST" });
}

/** `23-72`: "an administrator can change an existing colleague's role, both directions" - the console's
 * own call to `Ago.Chat.Api`'s new `POST .../operators/{operatorId}/role`. */
export function changeOperatorRole(
  accessToken: string,
  siteId: string,
  operatorId: string,
  roleName: string,
): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operators/${operatorId}/role`, {
    method: "POST",
    body: JSON.stringify({ roleName }),
  });
}

/** `25-170`: `roleName` is now required - `ToggleOperatorSeatHandler`'s own `ToggleOperatorSeat` command
 * gained it (`Ago.Chat.Api.Operators.OperatorsEndpoints.ToggleOperatorSeatRequest`), since a seat is now
 * a fact about one `(operator, role)` pairing, not the operator account as a whole. */
export function toggleOperatorSeat(
  accessToken: string,
  siteId: string,
  operatorId: string,
  roleName: string,
  holdsSeat: boolean,
): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operators/${operatorId}/seat`, {
    method: "POST",
    body: JSON.stringify({ roleName, holdsSeat }),
  });
}

export function removeOperator(accessToken: string, siteId: string, operatorId: string): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operators/${operatorId}/remove`, { method: "POST" });
}

export { ApiProblemError };
