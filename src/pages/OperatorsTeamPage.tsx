import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  changeOperatorRole,
  createOperatorInvite,
  fetchOperatorTeam,
  fetchSeatAssignmentSummary,
  listOperatorInvites,
  removeOperator,
  revokeOperatorInvite,
  toggleOperatorSeat,
  inviteLimitRoleForCode,
  ROLE_ADMIN,
  ROLE_OPERATOR,
  type CreateOperatorInviteResponseDto,
  type OperatorInviteListEntryDto,
  type OperatorTeamMemberDto,
  type RoleSeatAssignmentSummaryDto,
  type SeatAssignmentSummaryDto,
} from "../api/operatorTeamApi.js";
import { shapeMismatchMessage } from "./apiErrorMessage.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Table } from "../components/Table.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { RemoveOperatorButton } from "./RemoveOperatorButton.js";
import { SeatToggleButton } from "./SeatToggleButton.js";
import { ChangeOperatorRoleButton } from "./ChangeOperatorRoleButton.js";

/** `23-22`'s own dedicated permission - the first thing the console ever checks it for
 * (`ui-inventory.md` §13.4's own finding: "the console never checks that permission, has no route
 * for it"). Named once here, colocated with the one screen that checks it, the same
 * `SITE_ERASE_PERMISSION`/`CONVERSATION_ERASE_PERMISSION` precedent every other dedicated-permission
 * screen in this codebase already follows. */
export const OPERATORS_TEAM_PERMISSION = "site:manage_operators";

/** `23-02`: the same "no name, so the id itself" fallback `AdminConversationsPage`/
 * `OperatorAnalyticsPage`/`ConversionReportPage` each already carry their own copy of - a row that
 * predates the column, or an operator `MintDemoTenantHandler` minted with no claims to copy
 * (`adr/0104`). Not extracted into a shared helper: none of those three screens share one today
 * either, and unifying four independent copies is a larger, separate cleanup this item was not asked
 * to make. */
function operatorLabel(operatorId: string, displayName: string | null): ReactNode {
  return displayName ? <span>{displayName}</span> : <span className="ago-mono">{operatorId.slice(0, 8)}</span>;
}

/** `25-170`: the one place this page turns a bare role name into its own displayed word - every seat
 * badge, seat-toggle button and summary line that now renders per role goes through this rather than
 * repeating the `roleName === ROLE_ADMIN ? ... : ...` ternary the Role column badge used inline before
 * this item. */
function roleDisplayName(roleName: string, strings: ConsoleStrings): string {
  return roleName === ROLE_ADMIN ? strings.operatorsTeamRoleAdmin : strings.operatorsTeamRoleOperator;
}

/** `25-170`: one seeded role's own seat summary off the site-wide response, or `null` before the
 * summary has loaded - the single lookup every per-role rendering below (the seats line, the over-
 * limit banner, the invite dialog's own pre-flight check) shares rather than re-deriving. */
function roleSummary(summary: SeatAssignmentSummaryDto | null, roleName: string): RoleSeatAssignmentSummaryDto | null {
  return summary?.roles.find((r) => r.roleName === roleName) ?? null;
}

/** `26-241`: the two seeded roles an invite can grant, in the order the dialog offers their checkboxes
 * and the order `roleNames` goes on the wire in - a single source both the checkbox list and the
 * selected-set filter read, so the request body is always seeded-order and never depends on the order
 * a tenant happened to tick the boxes. */
const INVITE_ROLE_ORDER = [ROLE_OPERATOR, ROLE_ADMIN] as const;

/** `26-241`: does this role's own pool have no room for one more seat - the per-role half of the invite
 * pre-flight, the same `heldSeats >= limit` "at capacity" predicate `OperatorRoleSeatCapacity.CheckAsync`
 * gates each role in the set with server-side. `null` (summary not yet loaded) is treated as "not
 * known to be full" so the pre-flight never blocks purely on a slow read - the server is the real gate. */
function roleSeatFull(summary: SeatAssignmentSummaryDto | null, roleName: string): boolean {
  const s = roleSummary(summary, roleName);
  return s !== null && s.heldSeats >= s.limit;
}

/**
 * `23-22`: `/settings/operators` - "a tenant can invite a colleague, see who is on the site, see who
 * occupies a paid seat, and remove somebody who has left - from the console, in one place"
 * (backlog's own Goal).
 *
 * ## What this screen calls, and what it had to add
 *
 * `GET .../operators/seat-assignment-summary` (`13-03`) already existed and answered three aggregate
 * numbers for the Operator role alone (`heldSeats`/`seatLimit`/`overSeats`) - but it carried **no
 * per-operator rows**, contrary to what this item's own backlog text implied ("its rows carry names").
 * The rows this screen actually needs - every active operator, named, with which roles hold seats -
 * came from a new read this console change added to `ago-chat` alongside it: `GET
 * /api/v1/sites/{siteId}/operators` (`GetOperatorTeamHandler`). Invite creation, seat toggle and removal
 * all reuse `13-01`/`13-03`'s existing write endpoints (seat toggle now also takes `roleName`,
 * `25-170`) - `operatorTeamApi.ts` is a thin wire-shape file over all four, new and old alike.
 *
 * ## `25-170`: the pre-invite seat check, and why it is now role-scoped
 *
 * Before this item, `OperatorInviteRedemptionRepository`'s own real refusal predicate at redemption
 * time was `operatorCount >= seatLimit` - every `operators` row with `removed_at IS NULL`, regardless
 * of role or seat-holding status - which is why this screen used to predict from the team list's own
 * row count (`activeOperatorCount`) rather than `summary.heldSeats`: the two could genuinely diverge
 * (an operator who toggled their own seat off still counted as a row), and predicting from `heldSeats`
 * would have told an inviter "you have room" the moment before the server disagreed.
 *
 * That predicate is gone. Both invite redemption and this screen's own pre-flight check now go through
 * the one unified `OperatorRoleSeatCapacity.CheckAsync(siteId, roleName, ct)` - "does this *specific
 * role's own* live held-seat count already meet its own limit" - so `activeOperatorCount` is retired
 * entirely and the prediction is read straight off `summary.roles` (`roleSummary`/`roleSeatFull` below).
 * An administrator invite is checked against the Admin role's own `Site.AdminLimit`, never the Operator
 * role's - the two counted pools this item's own design gave each seeded role.
 *
 * ## `26-241`: one invite, a *set* of roles
 *
 * The invite dialog offers a multi-select (a checkbox per seeded role) rather than the single-choice
 * `Select` `23-72` gave it - one invite can grant both seeded roles at once (`roleNames`, gated per
 * role at send time, `ago-chat#383`). The pre-flight generalises accordingly: submit is blocked while
 * *any* ticked role's own pool is full or nothing is ticked (`inviteSubmitBlocked`), with the form left
 * visible and a per-role message shown - so untick a full role and invite the rest, rather than the
 * old whole-dialog "Close only" dead-end. The server refuses a full role with a `402`
 * (`SeatLimitReached`/`AdminLimitReached`); `attemptInvite` maps that code back to which role to name.
 *
 * ## The removal consequence, said before the click
 *
 * `RemoveOperatorButton`'s own confirmation names the release-to-`Waiting` consequence directly - see
 * that component's doc comment for why this screen needs no completion poll the way `16-02`'s account
 * deletion does.
 */
export function OperatorsTeamPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [team, setTeam] = useState<OperatorTeamMemberDto[] | null>(null);
  const [summary, setSummary] = useState<SeatAssignmentSummaryDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<CreateOperatorInviteResponseDto | null>(null);
  // `23-70`: the link's own "copied" confirmation - the identical `Button`+`Alert` shape
  // `InstallSnippetPage`'s own `copyKey`/`copySnippet` already establish for the same UX need.
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  // `23-72`/`26-241`: the invite dialog's own role choice - now a *set*, not a single pick. Defaults to
  // just Operator (the console's original, only offer before `23-72`); a one-role invite is simply a
  // one-element set. Held as an array in seeded order (`INVITE_ROLE_ORDER`) rather than a `Set`, so it
  // maps straight onto `roleNames` on the wire and renders deterministically.
  const [inviteRoles, setInviteRoles] = useState<string[]>([ROLE_OPERATOR]);
  // `25-73`: required on the form now - the address Keycloak's own invite email goes to.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailValidationError, setInviteEmailValidationError] = useState<string | null>(null);

  // `25-73`: the invite-list table - "shown only when at least one invite exists for the site"
  // (this item's own point 7), so `null` (not yet loaded) and `[]` (loaded, empty) are kept distinct.
  const [invites, setInvites] = useState<OperatorInviteListEntryDto[] | null>(null);
  const [invitesLoadError, setInvitesLoadError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OperatorInviteListEntryDto | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  const load = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    Promise.all([fetchOperatorTeam(accessToken, siteId), fetchSeatAssignmentSummary(accessToken, siteId)])
      .then(([teamResponse, summaryResponse]) => {
        setTeam(teamResponse.operators);
        setSummary(summaryResponse);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(shapeMismatchMessage(err, strings) ?? (err instanceof ApiProblemError ? err.message : strings.operatorsTeamLoadError)),
      );
  }, [accessToken, siteId, strings]);

  // `25-73`: its own load, separate from `load()` above - the invite list is a genuinely different
  // read (a different endpoint, a different failure to report) from the operator table/seat summary,
  // the same "one function per concern" split this page already draws between those two.
  const loadInvites = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    listOperatorInvites(accessToken, siteId)
      .then((response) => {
        setInvites(response.invites);
        setInvitesLoadError(null);
      })
      .catch((err: unknown) =>
        setInvitesLoadError(
          shapeMismatchMessage(err, strings) ?? (err instanceof ApiProblemError ? err.message : strings.operatorsTeamInviteListLoadError),
        ),
      );
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(OPERATORS_TEAM_PERMISSION)) {
      return;
    }
    load();
    loadInvites();
  }, [load, loadInvites, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(OPERATORS_TEAM_PERMISSION)) {
    // `23-24`: shared `AccessRefusal`, matching every other dedicated-permission screen in this shell.
    return <AccessRefusal title={strings.operatorsTeamTitle} message={strings.operatorsTeamForbidden} strings={strings} />;
  }

  // `25-170`: invite-time capacity is checked by the one unified `OperatorRoleSeatCapacity.CheckAsync(
  // siteId, roleName, ct)` - "does this *specific role's* own live held-seat count already meet its own
  // limit" (`IsAtCapacity = heldSeats >= limit`) - read straight off `summary.roles`, never the team
  // list's own row count and never `overLimit` (`heldSeats > limit`, a strictly higher threshold that
  // answers the "you are already over" banner, not "no room for one more").
  //
  // `26-241`: the invite grants a *set* of roles, each gated against its own pool at send time - so the
  // pre-flight is now "every selected role has a free seat", not one selected role's. `fullSelectedRoles`
  // is which ticked roles are already full (in seeded order, for a stable message); submit is blocked
  // while that list is non-empty or nothing is ticked at all. The server enforces the same per-role gate
  // (defense in depth) - a `402` on any one role is handled in `attemptInvite` below.
  const fullSelectedRoles = INVITE_ROLE_ORDER.filter((roleName) => inviteRoles.includes(roleName) && roleSeatFull(summary, roleName));
  const anySelectedRoleFull = fullSelectedRoles.length > 0;
  const noRoleSelected = inviteRoles.length === 0;
  const inviteSubmitBlocked = noRoleSelected || anySelectedRoleFull;

  const toggleInviteRole = (roleName: string, selected: boolean) => {
    setInviteRoles((current) => {
      const without = current.filter((r) => r !== roleName);
      return selected ? INVITE_ROLE_ORDER.filter((r) => r === roleName || without.includes(r)) : without;
    });
  };

  const openInviteDialog = () => {
    setInviteError(null);
    setInviteResult(null);
    setInviteLinkCopied(false);
    setInviteRoles([ROLE_OPERATOR]);
    setInviteEmail("");
    setInviteEmailValidationError(null);
    setInviteDialogOpen(true);
  };

  const closeInviteDialog = () => {
    setInviteDialogOpen(false);
    setInviteError(null);
    setInviteResult(null);
    setInviteLinkCopied(false);
  };

  const attemptInvite = async () => {
    if (!accessToken || !siteId) {
      return;
    }

    // `25-73`: refused by the API too (`OperatorInvite.InvalidEmail`) - this is only the same
    // "catch an obvious mistake before a round trip" UX-only check `OnboardingPage.tsx`'s own
    // `validate()` already uses for its origin field, never the real gate.
    // `26-241`: mirrors the render-time `inviteSubmitBlocked` gate (submit is disabled while it holds) -
    // repeated here so a stale click cannot slip an empty-set or full-seat invite past to the server.
    if (inviteSubmitBlocked) {
      return;
    }

    const trimmedEmail = inviteEmail.trim();
    if (trimmedEmail.length === 0) {
      setInviteEmailValidationError(strings.operatorsTeamInviteEmailValidationEmpty);
      return;
    }
    setInviteEmailValidationError(null);

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      // `26-241`: the ticked roles, in seeded order (`inviteRoles` is already kept ordered) - a one-role
      // invite is a one-element set, so an ordinary Operator-only invite still sends `["Operator"]`.
      const created = await createOperatorInvite(accessToken, siteId, inviteRoles, trimmedEmail);
      setInviteResult(created);
      // The invite list below should reflect this new row (and, if the send failed, its status) the
      // moment the dialog is closed - reloaded now rather than only on the next full page visit.
      loadInvites();
    } catch (err) {
      setInviteError(inviteSubmitErrorMessage(err));
    } finally {
      setInviteSubmitting(false);
    }
  };

  // `26-241`: the server gates each role in the set at send time (defense in depth behind the
  // `inviteSubmitBlocked` pre-flight) - a `402` `OperatorInvite.SeatLimitReached`/`AdminLimitReached`
  // names which role's own pool refused. `inviteLimitRoleForCode` turns that `type` back into a role
  // name so the surfaced message says *which* seat is full, in the tenant's own words, rather than the
  // server's generic `detail`. Any other failure keeps the existing generic-then-`ApiProblemError.message`
  // shape this page already used.
  function inviteSubmitErrorMessage(err: unknown): string {
    if (err instanceof ApiProblemError) {
      const fullRole = inviteLimitRoleForCode(err.code);
      if (fullRole !== null) {
        return `${roleDisplayName(fullRole, strings)} ${strings.operatorsTeamInviteRoleSeatFull}`;
      }
      return err.message;
    }
    return strings.operatorsTeamInviteSubmitError;
  }

  const attemptRevoke = async () => {
    if (!accessToken || !siteId || !revokeTarget) {
      return;
    }

    setRevokeSubmitting(true);
    setRevokeError(null);
    try {
      await revokeOperatorInvite(accessToken, siteId, revokeTarget.operatorInviteId);
      setRevokeTarget(null);
      loadInvites();
    } catch (err) {
      setRevokeError(err instanceof ApiProblemError ? err.message : strings.operatorsTeamInviteRevokeError);
    } finally {
      setRevokeSubmitting(false);
    }
  };

  const inviteStatusLabel = (entry: OperatorInviteListEntryDto): string => {
    switch (entry.status) {
      case "Sent":
        return strings.operatorsTeamInviteStatusSent;
      case "SendFailed":
        return `${strings.operatorsTeamInviteStatusSendFailed} ${entry.smtpErrorCode ?? "?"}`;
      case "Revoked":
        return strings.operatorsTeamInviteStatusRevoked;
      case "Redeemed":
        return strings.operatorsTeamInviteStatusRedeemed;
      case "Expired":
        return strings.operatorsTeamInviteStatusExpired;
    }
  };

  const expiresAtDate = inviteResult ? parseInstant(inviteResult.expiresAt) : null;
  // `23-70`: "the invitation is a URL, not a token... something that can be pasted into whatever the
  // tenant already uses to talk to their colleague" (this item's own backlog text) - built from this
  // console's own origin plus `/invite/{code}` (`InvitePreviewPage`'s own route), not a second config
  // value: this page and the landing page it links to are both served from the same console, so there
  // is nothing here for a `VITE_*` origin to name that `window.location.origin` does not already
  // answer, the identical reasoning `InstallSnippetPage`'s own doc comment gives for composing its
  // snippet from `config.apiBaseUrl` rather than a second `VITE_WIDGET_BASE_URL`.
  const inviteLink = inviteResult ? `${window.location.origin}/invite/${inviteResult.code}` : null;

  const copyInviteLink = () => {
    if (!inviteLink) {
      return;
    }
    void navigator.clipboard.writeText(inviteLink);
    setInviteLinkCopied(true);
  };

  return (
    <>
      <PageHead title={strings.operatorsTeamTitle} description={strings.operatorsTeamDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {team === null || summary === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={4} label={strings.operatorsTeamLoadingLabel} />
          </Panel>
        )
      ) : (
        <div className="ago-stack">
          {/* `13-03`'s own over-seats case: a site sitting above its seat limit after a downgrade -
              rendered honestly, every row still listed below, never hidden. `25-170`: one alert per
              over-limit role - the Admin role now gets the identical visibility the Operator role
              always had, rather than one role-agnostic check. */}
          {summary.roles
            .filter((role) => role.overLimit)
            .map((role) => (
              // `23-107`: a real link to where a tenant actually raises the limit or frees a seat, not
              // a name for the tenant to go find in the nav themselves - the same fix
              // `CalendarWorkersPage.tsx`'s own no-calendar note got.
              <Alert
                key={role.roleName}
                tone="info"
                title={strings.operatorsTeamOverSeatsTitle}
                action={<Link to="/account/billing">{strings.navBilling}</Link>}
              >
                {roleDisplayName(role.roleName, strings)}: {strings.operatorsTeamOverSeatsBody} {role.heldSeats}/{role.limit}.
              </Alert>
            ))}

          <Panel
            title={strings.operatorsTeamPanelTitle}
            actions={
              <Button variant="primary" onClick={openInviteDialog}>
                {strings.operatorsTeamInviteButton}
              </Button>
            }
          >
            <div className="ago-stack">
              {/* `25-170`: one line per seeded role - was a single, Operator-role-only line before
                  the Admin role got its own counted pool. */}
              {summary.roles.map((role) => (
                <p key={role.roleName}>
                  {roleDisplayName(role.roleName, strings)} {strings.operatorsTeamSeatsSummaryLabel} {role.heldSeats}/{role.limit}
                </p>
              ))}

              <Table<OperatorTeamMemberDto>
                caption={strings.operatorsTeamTableCaption}
                rowKey={(row) => row.operatorId}
                rows={team}
                columns={[
                  {
                    key: "name",
                    header: strings.operatorsTeamNameColumn,
                    render: (row) => operatorLabel(row.operatorId, row.displayName),
                  },
                  {
                    key: "email",
                    header: strings.operatorsTeamEmailColumn,
                    render: (row) => row.email ?? "—",
                  },
                  {
                    key: "role",
                    header: strings.operatorsTeamRoleColumn,
                    render: (row) => (
                      <Badge tone={row.roles.some((r) => r.roleName === ROLE_ADMIN) ? "brand" : "neutral"}>
                        {row.roles.some((r) => r.roleName === ROLE_ADMIN) ? strings.operatorsTeamRoleAdmin : strings.operatorsTeamRoleOperator}
                      </Badge>
                    ),
                  },
                  {
                    key: "seat",
                    header: strings.operatorsTeamSeatColumn,
                    render: (row) => (
                      // `25-170`: one badge per role this operator holds - a founder holding both
                      // seeded roles can hold one role's seat while having lost the other's, so a
                      // single row-wide badge could no longer say "holds a seat" truthfully.
                      <div className="ago-stack">
                        {row.roles.map((r) => (
                          <div key={r.roleName} className="ago-row ago-row--tight">
                            <span className="ago-meta">{roleDisplayName(r.roleName, strings)}:</span>
                            <Badge tone={r.holdsSeat ? "success" : "neutral"}>
                              {r.holdsSeat ? strings.operatorsTeamSeatHeld : strings.operatorsTeamSeatNotHeld}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    header: strings.operatorsTeamActionsColumn,
                    render: (row) => (
                      <div className="ago-row">
                        <ChangeOperatorRoleButton
                          isAdmin={row.roles.some((r) => r.roleName === ROLE_ADMIN)}
                          displayName={row.displayName ?? row.operatorId.slice(0, 8)}
                          onChange={(newRoleName) => {
                            if (!accessToken || !siteId) {
                              return Promise.resolve();
                            }
                            return changeOperatorRole(accessToken, siteId, row.operatorId, newRoleName);
                          }}
                          onChanged={load}
                        />
                        {/* `25-170`: one seat toggle per role this operator holds - generalised from
                            the pre-`25-170` single, Operator-role-only toggle, the same way the badge
                            above it now renders per role. */}
                        {row.roles.map((r) => (
                          <SeatToggleButton
                            key={r.roleName}
                            roleName={r.roleName}
                            holdsSeat={r.holdsSeat}
                            onToggle={(holdsSeat) => {
                              if (!accessToken || !siteId) {
                                return Promise.resolve();
                              }
                              return toggleOperatorSeat(accessToken, siteId, row.operatorId, r.roleName, holdsSeat);
                            }}
                            onToggled={load}
                          />
                        ))}
                        <RemoveOperatorButton
                          displayName={row.displayName ?? row.operatorId.slice(0, 8)}
                          onRemove={() => {
                            if (!accessToken || !siteId) {
                              return Promise.resolve();
                            }
                            return removeOperator(accessToken, siteId, row.operatorId);
                          }}
                          onRemoved={load}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </Panel>

          {/* `25-73`: shown only when at least one invite exists for the site - this item's own
              point 7. `invites === null` (not yet loaded) and `invites.length === 0` (loaded, none
              exist) are both "render nothing", the identical "no Panel at all" shape this page
              already gives an empty state elsewhere rather than an empty table with a caption. */}
          {invitesLoadError && <Alert tone="danger">{invitesLoadError}</Alert>}
          {invites !== null && invites.length > 0 && (
            <Panel title={strings.operatorsTeamInviteListPanelTitle}>
              <Table<OperatorInviteListEntryDto>
                caption={strings.operatorsTeamInviteListPanelTitle}
                rowKey={(row) => row.operatorInviteId}
                rows={invites}
                columns={[
                  {
                    key: "email",
                    header: strings.operatorsTeamInviteListEmailColumn,
                    render: (row) => row.email,
                  },
                  {
                    key: "sent",
                    header: strings.operatorsTeamInviteListSentColumn,
                    render: (row) => formatDateStamp(parseInstant(row.createdAt), timeZone, strings),
                  },
                  {
                    key: "status",
                    header: strings.operatorsTeamInviteListStatusColumn,
                    render: (row) => (
                      <Badge tone={row.status === "SendFailed" ? "danger" : row.status === "Revoked" ? "neutral" : "success"}>
                        {inviteStatusLabel(row)}
                      </Badge>
                    ),
                  },
                  {
                    key: "expiry",
                    header: strings.operatorsTeamInviteListExpiryColumn,
                    render: (row) => formatDateStamp(parseInstant(row.expiresAt), timeZone, strings),
                  },
                  {
                    key: "actions",
                    header: strings.operatorsTeamInviteListActionsColumn,
                    render: (row) =>
                      // Only an unredeemed, unrevoked, still-live invite can be revoked at all - the
                      // button simply is not offered for a row already past that point, rather than
                      // being offered and refused server-side (RevokeOperatorInviteHandler's own
                      // AlreadyRedeemed/Revoked checks still exist as the real, load-bearing guard;
                      // this is presentation only).
                      row.status === "Sent" || row.status === "SendFailed" ? (
                        <Button variant="ghost" onClick={() => setRevokeTarget(row)}>
                          {strings.operatorsTeamInviteRevokeButton}
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </Panel>
          )}
        </div>
      )}

      <Dialog
        open={revokeTarget !== null}
        title={strings.operatorsTeamInviteRevokeDialogTitle}
        onClose={() => setRevokeTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revokeSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="primary" onClick={() => void attemptRevoke()} disabled={revokeSubmitting}>
              {strings.operatorsTeamInviteRevokeConfirmButton}
            </Button>
          </>
        }
      >
        <div className="ago-stack">
          <p>
            {strings.operatorsTeamInviteRevokeDialogBody} {revokeTarget?.email}?
          </p>
          {revokeError && <Alert tone="danger">{revokeError}</Alert>}
        </div>
      </Dialog>

      <Dialog
        open={inviteDialogOpen}
        title={strings.operatorsTeamInviteDialogTitle}
        onClose={closeInviteDialog}
        footer={
          inviteResult ? (
            <Button variant="primary" onClick={closeInviteDialog}>
              {strings.operatorsTeamInviteCloseButton}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeInviteDialog} disabled={inviteSubmitting}>
                {strings.cancelButton}
              </Button>
              {/* `26-241`: the pre-flight is now "submit disabled + a clear message", not a whole-form
                  replacement - the form (with its role checkboxes) stays visible so a tenant whose
                  default Operator seat is full can untick it and invite an Admin instead. Submit is
                  blocked while no role is ticked or any ticked role's own pool is full
                  (`inviteSubmitBlocked`); the per-role reason is shown in the body. */}
              <Button
                variant="primary"
                onClick={() => void attemptInvite()}
                disabled={inviteSubmitting || inviteSubmitBlocked}
              >
                {inviteSubmitting ? strings.operatorsTeamInviteSendingButton : strings.operatorsTeamInviteConfirmButton}
              </Button>
            </>
          )
        }
      >
        {inviteResult ? (
          <div className="ago-stack">
            {/* `25-73`: Keycloak sends the email itself now - the success panel leads with that fact,
                never only the copyable link `23-70` built for the admin to distribute by hand. That
                link is kept below as a fallback (the invite's own code/link still works, e.g. for
                sharing over a channel Keycloak's mail relay cannot reach), not removed outright. */}
            <Alert tone={inviteResult.sendFailed ? "danger" : "success"} title={strings.operatorsTeamInviteSuccessTitle}>
              {inviteResult.sendFailed ? strings.operatorsTeamInviteSendFailedWarning : (
                <>
                  {strings.operatorsTeamInviteSuccessBodyEmail} {inviteEmail}
                </>
              )}
            </Alert>
            <p>{strings.operatorsTeamInviteSuccessBody}</p>
            <p>
              <strong>{strings.operatorsTeamInviteLinkLabel}:</strong>
            </p>
            <div className="ago-row">
              <code className="ago-mono ago-install-value">{inviteLink}</code>
              <Button onClick={copyInviteLink}>{strings.operatorsTeamInviteCopyButton}</Button>
            </div>
            {inviteLinkCopied && <Alert tone="success">{strings.operatorsTeamInviteCopiedLabel}</Alert>}
            {expiresAtDate && (
              <p>
                {strings.operatorsTeamInviteExpiresLabel} {formatDateStamp(expiresAtDate, timeZone, strings)}
              </p>
            )}
          </div>
        ) : (
          <div className="ago-stack">
            {/* `25-73`: required now - refused server-side (`OperatorInvite.InvalidEmail`) when
                absent or malformed, this field only catches the empty case before a round trip. */}
            <Field label={strings.operatorsTeamInviteEmailLabel} error={inviteEmailValidationError}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviteSubmitting}
                  autoComplete="off"
                />
              )}
            </Field>

            {/* `26-241`: the role picker is now a *multi-select* - one checkbox per seeded role, at
                least one required (`23-72`'s single-choice `Select` could only ever grant one). The API
                takes a set (`roleNames`, `ago-chat#383`); a one-role invite is a one-element set. */}
            <fieldset className="ago-stack">
              <legend>{strings.operatorsTeamInviteRolesLabel}</legend>
              {INVITE_ROLE_ORDER.map((roleName) => (
                <label key={roleName} className="ago-row">
                  <input
                    type="checkbox"
                    checked={inviteRoles.includes(roleName)}
                    onChange={(e) => toggleInviteRole(roleName, e.target.checked)}
                    disabled={inviteSubmitting}
                  />
                  <span>
                    {roleName === ROLE_ADMIN
                      ? strings.operatorsTeamInviteRoleAdminOption
                      : strings.operatorsTeamInviteRoleOperatorOption}
                  </span>
                </label>
              ))}
            </fieldset>

            {/* `25-18`/`25-170`/`26-241`: one cost line per *selected* role that still has room - names
                which seat each grant spends, reactively (re-reads `inviteRoles` every render, so ticking
                a box updates this before submit). The count/limit are the role's own real figures, not a
                shared or fabricated one - see `operatorsTeamInviteCostBodyOperator`'s own doc comment. */}
            {inviteRoles
              .filter((roleName) => !roleSeatFull(summary, roleName))
              .map((roleName) => {
                const s = roleSummary(summary, roleName);
                return (
                  <p key={roleName}>
                    {roleName === ROLE_ADMIN ? strings.operatorsTeamInviteCostBodyAdmin : strings.operatorsTeamInviteCostBodyOperator}{" "}
                    {(s?.heldSeats ?? 0) + 1}/{s?.limit}.
                  </p>
                );
              })}

            {/* `26-241`: the pre-flight's "clear message" half - which ticked role(s) have no free seat,
                said in the tenant's own words, with a real link to where the limit is raised (`23-107`'s
                fix). Submit stays disabled (`inviteSubmitBlocked`) while this shows - the invite is
                refused before a round trip, and the server gates it again at send time. */}
            {anySelectedRoleFull && (
              <Alert
                tone="info"
                title={strings.operatorsTeamInviteAtLimitTitle}
                action={<Link to="/account/billing">{strings.navBilling}</Link>}
              >
                {fullSelectedRoles.map((roleName) => (
                  <p key={roleName}>
                    {roleDisplayName(roleName, strings)} {strings.operatorsTeamInviteRoleSeatFull}
                  </p>
                ))}
              </Alert>
            )}

            {noRoleSelected && <Alert tone="info">{strings.operatorsTeamInviteNoRoleSelected}</Alert>}

            {inviteError && <Alert tone="danger">{inviteError}</Alert>}
          </div>
        )}
      </Dialog>
    </>
  );
}
