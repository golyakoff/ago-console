import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

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
  /** `26-263`: the redeemed instant of the invite this member joined through (`ago-chat#387`'s own
   * `GetOperatorTeamHandler` - a correlated scalar subquery over `operator_invites`) - the «Принято
   * `<date>`» line `OperatorsTeamPage` renders next to the "В команде" status. `null` for the founder,
   * who was minted at registration and never invited (`RegisterSiteHandler`), never for anyone else -
   * every other active operator reached this site through exactly one redeemed invite. */
  joinedAt: string | null;
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
 * `smtpErrorCode` is present only when `status === "SendFailed"`.
 * `26-258`: `roles` is the role SET this still-pending invite grants, as the role names
 * (`["Operator", "Admin"]`) - the read-side mirror of the multi-role invite `26-241` added to creation,
 * alphabetically ordered by the backend read store. A single-role invite is a one-element list; the
 * field is always present and never null (an empty list at worst), so the page always has something to
 * render on the pending-invite row. */
export interface OperatorInviteListEntryDto {
  operatorInviteId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: "Sent" | "SendFailed" | "Revoked" | "Redeemed" | "Expired";
  smtpErrorCode: string | null;
  roles: string[];
  /**
   * `26-263`: a SECOND, distinct status from `status` above - never a replacement for it
   * (`ago-chat#387`'s own remarks: "`status` is unchanged so the console's existing invite-list screen
   * keeps working"). `status` is the invite's *delivery* lifecycle (`Sent`/`SendFailed`/…), which
   * collapses every redemption into one `Redeemed` value and so cannot say whether that operator is
   * still on the team; `effectiveStatus` is the *team-membership* view `OperatorsTeamPage` groups and
   * colours by - `Pending` (not yet redeemed, not revoked, not expired), `InTeam` (redeemed, operator
   * still active), `Removed` (redeemed, operator since soft-removed), `Revoked`, `Expired`. Computed
   * server-side against `IClock` (`adr/0011`) - never derived client-side from `expiresAt`, the same
   * "ordering/time facts come from the server, not a client clock" reasoning `date-and-time.md` states
   * for every other server-truth timestamp. Sent as the enum member name, the same `api-design.md`
   * "clients branch on the code, never on the message" convention `status` above already follows.
   *
   * Typed as the five known members, but every switch over it in `OperatorsTeamPage` carries a
   * `default` branch (`AdminConversationsPage.tsx#stateTone`'s own established shape for exactly this
   * reason) - a compile-time union only ever protects against the cases *this* file's author already
   * knew about, and a value the wire sends tomorrow that this type does not yet list must still render
   * as something visible, not silently vanish or throw.
   */
  effectiveStatus: "Pending" | "InTeam" | "Removed" | "Revoked" | "Expired";
  /** `26-263`: when this invite was redeemed (the «Принято `<date>`» line) - non-null for `InTeam`/
   * `Removed` (the only two states reached by an actual redemption), `null` for `Pending`/`Revoked`/
   * `Expired` (never redeemed at all). */
  redeemedAt: string | null;
  /** `26-263`: the redeemed operator's own removal instant (the «Удалено `<date>`» line) - non-null
   * only when `effectiveStatus === "Removed"`, `null` in every other case (including `InTeam`, where
   * the operator has not been removed at all). */
  removedAt: string | null;
  /** `26-263`/`ago-chat#388`: when this invite was revoked (the «Отозвано `<date>`» line) - additive
   * alongside `redeemedAt`/`removedAt`, non-null only when `effectiveStatus === "Revoked"`, `null` in
   * every other case. Added one PR after `redeemedAt`/`removedAt` because the `Revoked` archive card
   * initially shipped with no date at all - the wire carried no revocation instant yet at that point,
   * and `OperatorsTeamPage` said so explicitly rather than fabricating one from `createdAt`/`expiresAt`
   * (`CLAUDE.md`: "do not invent numbers... measure or stay silent"). This field is that gap closed. */
  revokedAt: string | null;
}

export interface ListOperatorInvitesResponseDto {
  invites: OperatorInviteListEntryDto[];
}

/**
 * `23-118`/`23-99`: the runtime shapes the three team reads promise. Each is a list-or-count screen
 * where a dropped field and a genuinely empty result render identically:
 * - `fetchOperatorTeam` drops `operators` -> "no colleagues" (`OperatorsTeamPage` renders `team` as an
 *   empty table), and a member dropping `roles` -> that operator shows no roles / no seat controls, a
 *   dropped `holdsSeat` on a role -> the seat toggle reads `undefined` = off (false-negative). Every
 *   member is checked, and every role within each member, since one truncated row must not read as
 *   "the rest loaded fine".
 * - `fetchSeatAssignmentSummary` drops `roles` -> no seat limits shown, and a row dropping `heldSeats`/
 *   `limit` -> the pre-invite capacity check silently compares against `undefined`.
 * - `listOperatorInvites` drops `invites` -> `undefined`, which the page treats as "no invites yet" and
 *   hides the whole table (it keeps `null` distinct from `[]`), a false-empty; an entry dropping `status`
 *   -> a blank status badge.
 * All fields are present-but-maybe-null on the wire (none is `?`), so all are required keys. Rethrown as
 * `ApiProblemError('shape.mismatch')` - the file's own error type - so `OperatorsTeamPage`'s two load
 * `catch`es surface it localized via `shapeMismatchMessage` instead of rendering a false-empty table. The
 * write methods (`createOperatorInvite`, `revokeOperatorInvite`, `changeOperatorRole`,
 * `toggleOperatorSeat`, `removeOperator`) are out of scope per the bound.
 */
const operatorTeamRequiredKeys = requiredKeysOf<OperatorTeamResponseDto>({ operators: true });
const operatorTeamMemberRequiredKeys = requiredKeysOf<OperatorTeamMemberDto>({
  operatorId: true,
  displayName: true,
  email: true,
  roles: true,
  joinedAt: true,
});
const operatorRoleSeatRequiredKeys = requiredKeysOf<OperatorRoleSeatDto>({ roleName: true, holdsSeat: true });
const seatAssignmentSummaryRequiredKeys = requiredKeysOf<SeatAssignmentSummaryDto>({ roles: true });
const roleSeatAssignmentSummaryRequiredKeys = requiredKeysOf<RoleSeatAssignmentSummaryDto>({
  roleName: true,
  heldSeats: true,
  limit: true,
  overLimit: true,
});
const operatorInvitesListRequiredKeys = requiredKeysOf<ListOperatorInvitesResponseDto>({ invites: true });
const operatorInviteListEntryRequiredKeys = requiredKeysOf<OperatorInviteListEntryDto>({
  operatorInviteId: true,
  email: true,
  createdAt: true,
  expiresAt: true,
  status: true,
  smtpErrorCode: true,
  roles: true,
  effectiveStatus: true,
  redeemedAt: true,
  removedAt: true,
  revokedAt: true,
});

/**
 * Rethrows a `ShapeMismatchError` as `ApiProblemError('shape.mismatch')`, the same type every other
 * rejection in this file already produces (`problemDetailsFrom`), so `OperatorsTeamPage`'s existing
 * `catch`es need no second error vocabulary (mirrors `maxChannelApi.ts#rethrowAsApiProblem`). `status`
 * is `200`: a body only reaches validation after `operatorTeamFetch` passed the `response.ok` gate, so
 * the mismatch is always on a `2xx` read body.
 */
function rethrowAsApiProblem(reason: unknown): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, 200);
  }
  throw reason;
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

export async function fetchOperatorTeam(accessToken: string, siteId: string): Promise<OperatorTeamResponseDto> {
  const body = await operatorTeamFetch<OperatorTeamResponseDto>(accessToken, `/api/v1/sites/${siteId}/operators`);
  const context = `GET /api/v1/sites/${siteId}/operators`;
  try {
    assertHasKeys<OperatorTeamResponseDto>(body, operatorTeamRequiredKeys, context);
    assertArrayHasKeys<OperatorTeamMemberDto>(body.operators, operatorTeamMemberRequiredKeys, `${context} (operators)`);
    body.operators.forEach((member, index) => {
      assertArrayHasKeys<OperatorRoleSeatDto>(member.roles, operatorRoleSeatRequiredKeys, `${context} (operators[${String(index)}].roles)`);
    });
  } catch (reason) {
    rethrowAsApiProblem(reason);
  }
  return body;
}

export async function fetchSeatAssignmentSummary(accessToken: string, siteId: string): Promise<SeatAssignmentSummaryDto> {
  const body = await operatorTeamFetch<SeatAssignmentSummaryDto>(accessToken, `/api/v1/sites/${siteId}/operators/seat-assignment-summary`);
  const context = `GET /api/v1/sites/${siteId}/operators/seat-assignment-summary`;
  try {
    assertHasKeys<SeatAssignmentSummaryDto>(body, seatAssignmentSummaryRequiredKeys, context);
    assertArrayHasKeys<RoleSeatAssignmentSummaryDto>(body.roles, roleSeatAssignmentSummaryRequiredKeys, `${context} (roles)`);
  } catch (reason) {
    rethrowAsApiProblem(reason);
  }
  return body;
}

/** `23-72`: the only two role names any site has today (`RegisterSiteHandler`'s own seeding) - named
 * once here rather than as string literals scattered through the invite dialog and the role-change
 * button, the same reasoning the old `ORDINARY_ROLE_NAME` constant this replaces already had. Not an
 * enum: a role is still a name resolved server-side (`ago-chat`'s own `IRoleRepository`), never a typed
 * value this console owns. */
export const ROLE_OPERATOR = "Operator";
export const ROLE_ADMIN = "Admin";

/** `26-241`: the two `type` values `CreateOperatorInviteHandler` refuses a *per-role* seat-full invite
 * with - a `402` each (`OperatorInvite.SeatLimitReached` = the Operator role's own pool is full,
 * `OperatorInvite.AdminLimitReached` = the Admin role's own), and `OperatorInvite.InvalidRole` = a
 * `400` for a role name that is not one of the two seeded literals. Named here, not as string literals
 * in the page's own `catch`, the same `api-design.md` rule (`11-09`'s own `problemDetails.ts`: "clients
 * branch on `type`, never on the message") every other typed-error branch in this console already
 * follows. The page maps the two seat-full codes back to which role to name via `inviteLimitRoleForCode`
 * below - defense-in-depth behind the client-side pre-flight, since the server gates each role in the
 * set at send time. */
export const INVITE_OPERATOR_SEAT_FULL_CODE = "OperatorInvite.SeatLimitReached";
export const INVITE_ADMIN_SEAT_FULL_CODE = "OperatorInvite.AdminLimitReached";
export const INVITE_INVALID_ROLE_CODE = "OperatorInvite.InvalidRole";

/** `26-241`: which role a seat-full `402` (`ApiProblemError.code`) is about - `Operator`/`Admin`, or
 * `null` for any other code. The one place the two `402` `type`s are turned back into a role name the
 * dialog can display, so the page's own `catch` never repeats the `code === ... ? ROLE_... : ...`
 * mapping inline. */
export function inviteLimitRoleForCode(code: string): string | null {
  if (code === INVITE_OPERATOR_SEAT_FULL_CODE) {
    return ROLE_OPERATOR;
  }
  if (code === INVITE_ADMIN_SEAT_FULL_CODE) {
    return ROLE_ADMIN;
  }
  return null;
}

/** `25-73`: `email` is now required by the server itself - a missing/malformed value comes back as
 * `OperatorInvite.InvalidEmail` (`400`), thrown as an `ApiProblemError` the same way every other
 * validation failure in this file already is.
 *
 * `26-241`: the body now carries a *set* of role names (`roleNames`), not a single `roleName` - one
 * invite can grant both seeded roles at once, each gated against its own pool at send time
 * (`CreateOperatorInviteHandler`, `ago-chat#383`). The legacy single-`roleName` body still works
 * server-side, but the console always sends the plural form now; a one-role invite is simply a
 * one-element `roleNames`. Typed `readonly string[]` (a set of role names, deduped by the caller) - the
 * page hands over exactly the roles its checkboxes selected, in the seeded order. */
export function createOperatorInvite(
  accessToken: string,
  siteId: string,
  roleNames: readonly string[],
  email: string,
): Promise<CreateOperatorInviteResponseDto> {
  return operatorTeamFetch<CreateOperatorInviteResponseDto>(accessToken, `/api/v1/sites/${siteId}/operator-invites`, {
    method: "POST",
    body: JSON.stringify({ roleNames, email }),
  });
}

/** `25-73`: the invite-list table's own read - refetched by the caller (`OperatorsTeamPage`'s own
 * `load()`) after every create/revoke, the same "no separate cache, just reload" shape this file's
 * `fetchOperatorTeam` already uses for the operator table itself. */
export async function listOperatorInvites(accessToken: string, siteId: string): Promise<ListOperatorInvitesResponseDto> {
  const body = await operatorTeamFetch<ListOperatorInvitesResponseDto>(accessToken, `/api/v1/sites/${siteId}/operator-invites`);
  const context = `GET /api/v1/sites/${siteId}/operator-invites`;
  try {
    assertHasKeys<ListOperatorInvitesResponseDto>(body, operatorInvitesListRequiredKeys, context);
    assertArrayHasKeys<OperatorInviteListEntryDto>(body.invites, operatorInviteListEntryRequiredKeys, `${context} (invites)`);
  } catch (reason) {
    rethrowAsApiProblem(reason);
  }
  return body;
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
