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
  removeOperator,
  toggleOperatorSeat,
  ROLE_ADMIN,
  ROLE_OPERATOR,
  type CreateOperatorInviteResponseDto,
  type OperatorTeamMemberDto,
  type SeatAssignmentSummaryDto,
} from "../api/operatorTeamApi.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Table } from "../components/Table.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Select } from "../components/Select.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
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

/**
 * `23-22`: `/settings/operators` - "a tenant can invite a colleague, see who is on the site, see who
 * occupies a paid seat, and remove somebody who has left - from the console, in one place"
 * (backlog's own Goal).
 *
 * ## What this screen calls, and what it had to add
 *
 * `GET .../operators/seat-assignment-summary` (`13-03`) already existed and already answers the three
 * aggregate numbers (`heldSeats`/`seatLimit`/`overSeats`) - but it carries **no per-operator rows**,
 * contrary to what this item's own backlog text implied ("its rows carry names"). The rows this
 * screen actually needs - every active operator, named, with which hold seats - came from a new read
 * this console change added to `ago-chat` alongside it: `GET /api/v1/sites/{siteId}/operators`
 * (`GetOperatorTeamHandler`). Invite creation, seat toggle and removal all reuse `13-01`/`13-03`'s
 * existing write endpoints unchanged - `operatorTeamApi.ts` is a thin wire-shape file over all four,
 * new and old alike.
 *
 * ## The pre-invite seat check, and why it counts the team list rather than using `heldSeats`
 *
 * `RedeemOperatorInviteHandler`'s own real refusal predicate at redemption time is
 * `operatorCount >= seatLimit`, where `operatorCount` counts every `operators` row with
 * `removed_at IS NULL` (`OperatorInviteRedemptionRepository`'s own remarks: "how many operator rows
 * does this site have", unchanged since `13-03`) - never `heldSeats` (`HoldsSeat AND RemovedAt IS
 * NULL`), the number `/settings/billing` shows as "seats used". A site with one operator who toggled
 * their own seat off has `heldSeats` one lower than its real row count, so predicting the redemption
 * refusal from `heldSeats` would tell an inviter "you have room" the moment before the server
 * disagrees. `23-72`: an administrator invite is not exempt from this count either - a role is not a
 * purchase (`adr/0151`), and the row it creates is still an ordinary `operators` row.
 * `activeOperatorCount` mirrors the server's own predicate exactly (every active row) rather than a
 * narrower, more optimistic one - the same "predict the exact refusal" goal this paragraph always
 * described.
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
  // `23-72`: the invite dialog's own role choice - defaults to Operator, the console's original,
  // only offer before this item.
  const [inviteRoleName, setInviteRoleName] = useState(ROLE_OPERATOR);

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
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.operatorsTeamLoadError));
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(OPERATORS_TEAM_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(OPERATORS_TEAM_PERMISSION)) {
    // `23-24`: shared `AccessRefusal`, matching every other dedicated-permission screen in this shell.
    return <AccessRefusal title={strings.operatorsTeamTitle} message={strings.operatorsTeamForbidden} strings={strings} />;
  }

  // See this component's own doc comment for why this is derived from the team list's own rows, never
  // `summary.heldSeats` - `OperatorInviteRedemptionRepository`'s own real refusal predicate counts every
  // active `operators` row regardless of role or current seat-holding status, so predicting it from
  // `summary.heldSeats` would tell an inviter "you have room" the moment before the server disagrees.
  // `23-72`: an administrator invite is not exempt from this count - a role is not a purchase (`adr/0151`
  // keeps entitlement and permission apart), but the row it creates is still an ordinary `operators` row
  // and the seat-limit check has always counted rows, not seats held, since `13-03`. No `inviteRoleName`
  // check belongs here: the role picker itself only renders once this is already false (see the JSX
  // below), so a role-based exemption here could never be reached in the one case - at the limit - where
  // it would matter. An earlier draft carried `&& inviteRoleName === ROLE_OPERATOR`, which every test
  // still passed with removed, because nothing can ever exercise it; found while independently verifying
  // this item rather than by a failing test.
  const activeOperatorCount = team?.length ?? 0;
  const atSeatLimit = summary !== null && activeOperatorCount >= summary.seatLimit;

  const openInviteDialog = () => {
    setInviteError(null);
    setInviteResult(null);
    setInviteLinkCopied(false);
    setInviteRoleName(ROLE_OPERATOR);
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

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const created = await createOperatorInvite(accessToken, siteId, inviteRoleName);
      setInviteResult(created);
    } catch (err) {
      setInviteError(err instanceof ApiProblemError ? err.message : strings.operatorsTeamInviteSubmitError);
    } finally {
      setInviteSubmitting(false);
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
              rendered honestly, every row still listed below, never hidden. */}
          {summary.overSeats && (
            // `23-107`: a real link to where a tenant actually raises the limit or frees a seat, not
            // a name for the tenant to go find in the nav themselves - the same fix
            // `CalendarWorkersPage.tsx`'s own no-calendar note got.
            <Alert
              tone="info"
              title={strings.operatorsTeamOverSeatsTitle}
              action={<Link to="/account/billing">{strings.navBilling}</Link>}
            >
              {strings.operatorsTeamOverSeatsBody} {summary.heldSeats}/{summary.seatLimit}.
            </Alert>
          )}

          <Panel
            title={strings.operatorsTeamPanelTitle}
            actions={
              <Button variant="primary" onClick={openInviteDialog}>
                {strings.operatorsTeamInviteButton}
              </Button>
            }
          >
            <div className="ago-stack">
              <p>
                {strings.operatorsTeamSeatsSummaryLabel} {summary.heldSeats}/{summary.seatLimit}
              </p>

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
                      <Badge tone={row.roleNames.includes(ROLE_ADMIN) ? "brand" : "neutral"}>
                        {row.roleNames.includes(ROLE_ADMIN) ? strings.operatorsTeamRoleAdmin : strings.operatorsTeamRoleOperator}
                      </Badge>
                    ),
                  },
                  {
                    key: "seat",
                    header: strings.operatorsTeamSeatColumn,
                    render: (row) => (
                      <Badge tone={row.holdsSeat ? "success" : "neutral"}>
                        {row.holdsSeat ? strings.operatorsTeamSeatHeld : strings.operatorsTeamSeatNotHeld}
                      </Badge>
                    ),
                  },
                  {
                    key: "actions",
                    header: strings.operatorsTeamActionsColumn,
                    render: (row) => (
                      <div className="ago-row">
                        <ChangeOperatorRoleButton
                          isAdmin={row.roleNames.includes(ROLE_ADMIN)}
                          displayName={row.displayName ?? row.operatorId.slice(0, 8)}
                          onChange={(newRoleName) => {
                            if (!accessToken || !siteId) {
                              return Promise.resolve();
                            }
                            return changeOperatorRole(accessToken, siteId, row.operatorId, newRoleName);
                          }}
                          onChanged={load}
                        />
                        <SeatToggleButton
                          holdsSeat={row.holdsSeat}
                          onToggle={(holdsSeat) => {
                            if (!accessToken || !siteId) {
                              return Promise.resolve();
                            }
                            return toggleOperatorSeat(accessToken, siteId, row.operatorId, holdsSeat);
                          }}
                          onToggled={load}
                        />
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
        </div>
      )}

      <Dialog
        open={inviteDialogOpen}
        title={strings.operatorsTeamInviteDialogTitle}
        onClose={closeInviteDialog}
        footer={
          inviteResult ? (
            <Button variant="primary" onClick={closeInviteDialog}>
              {strings.operatorsTeamInviteCloseButton}
            </Button>
          ) : atSeatLimit ? (
            <Button variant="ghost" onClick={closeInviteDialog}>
              {strings.operatorsTeamInviteCloseButton}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeInviteDialog} disabled={inviteSubmitting}>
                {strings.cancelButton}
              </Button>
              <Button variant="primary" onClick={() => void attemptInvite()} disabled={inviteSubmitting}>
                {inviteSubmitting ? strings.operatorsTeamInviteSendingButton : strings.operatorsTeamInviteConfirmButton}
              </Button>
            </>
          )
        }
      >
        {inviteResult ? (
          <div className="ago-stack">
            <Alert tone="success" title={strings.operatorsTeamInviteSuccessTitle}>
              {strings.operatorsTeamInviteSuccessBody}
            </Alert>
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
        ) : atSeatLimit ? (
          // Done-when: "inviting when the seat limit is already reached is refused *before* the
          // invite is created, and says so in the tenant's own words" - no `createOperatorInvite`
          // call is ever made from this branch; the dialog's only footer action is `Close`. Applies
          // regardless of the role picked below - `activeOperatorCount`'s own remarks state why an
          // administrator invite is not exempt.
          // `23-107`: same fix as the over-seats Alert above - a real link, not a name.
          <Alert
            tone="info"
            title={strings.operatorsTeamInviteAtLimitTitle}
            action={<Link to="/account/billing">{strings.navBilling}</Link>}
          >
            {strings.operatorsTeamInviteAtLimitBody} {summary?.seatLimit}.
          </Alert>
        ) : (
          <div className="ago-stack">
            {/* `23-72`: the role picker - the API already took `roleName` at invite creation
                (`13-01`), this dialog just never offered a choice before this item. */}
            <label>
              {strings.operatorsTeamInviteRoleLabel}
              <Select value={inviteRoleName} onChange={(event) => setInviteRoleName(event.target.value)}>
                <option value={ROLE_OPERATOR}>{strings.operatorsTeamInviteRoleOperatorOption}</option>
                <option value={ROLE_ADMIN}>{strings.operatorsTeamInviteRoleAdminOption}</option>
              </Select>
            </label>

            <p>
              {strings.operatorsTeamInviteCostBody} {activeOperatorCount + 1}/{summary?.seatLimit}.
            </p>

            {inviteError && <Alert tone="danger">{inviteError}</Alert>}
          </div>
        )}
      </Dialog>
    </>
  );
}
