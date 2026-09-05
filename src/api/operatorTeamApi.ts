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
export interface OperatorTeamMemberDto {
  operatorId: string;
  displayName: string | null;
  email: string | null;
  holdsSeat: boolean;
}

export interface OperatorTeamResponseDto {
  operators: OperatorTeamMemberDto[];
}

/** `GetSeatAssignmentSummary.SeatAssignmentSummaryDto`'s own wire shape - `overSeats` is a derived,
 * read-time fact (`13-03`'s own Scope), never a stored flag. */
export interface SeatAssignmentSummaryDto {
  heldSeats: number;
  seatLimit: number;
  overSeats: boolean;
}

/** `CreateOperatorInviteEndpoints.CreateOperatorInviteResponse`'s own wire shape - `code` is the
 * plaintext invite code, present in this one response only (`OperatorInviteEndpoints`'s own remarks:
 * "shown exactly once"). */
export interface CreateOperatorInviteResponseDto {
  operatorInviteId: string;
  code: string;
  expiresAt: string;
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

/** `RoleName` is never offered as a choice on this screen (this item's own Out of scope: no role
 * catalogue exists yet, so a picker would just be the eleven-permission vocabulary `flows.md` 4.3
 * warns against) - always the ordinary `"Operator"` role every seed script already grants a fresh
 * site's own first operator. */
const ORDINARY_ROLE_NAME = "Operator";

export function createOperatorInvite(accessToken: string, siteId: string): Promise<CreateOperatorInviteResponseDto> {
  return operatorTeamFetch<CreateOperatorInviteResponseDto>(accessToken, `/api/v1/sites/${siteId}/operator-invites`, {
    method: "POST",
    body: JSON.stringify({ roleName: ORDINARY_ROLE_NAME }),
  });
}

export function toggleOperatorSeat(
  accessToken: string,
  siteId: string,
  operatorId: string,
  holdsSeat: boolean,
): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operators/${operatorId}/seat`, {
    method: "POST",
    body: JSON.stringify({ holdsSeat }),
  });
}

export function removeOperator(accessToken: string, siteId: string, operatorId: string): Promise<void> {
  return operatorTeamVoidFetch(accessToken, `/api/v1/sites/${siteId}/operators/${operatorId}/remove`, { method: "POST" });
}

export { ApiProblemError };
