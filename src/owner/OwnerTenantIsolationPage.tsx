import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOwnerTenantIsolationSummary,
  type OwnerTenantIsolationSummary,
} from "../api/ownerApi.js";
import {
  fetchOwnerTenantScopeSummary,
  type CalendarTenantScopeSummary,
} from "../api/calendarApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Panel } from "../components/Panel.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";

/** The same pre-answer/granted/refused shape every other `/owner/*` screen's own access state uses. */
type OwnerAccess = "unknown" | "granted" | "refused";

/** One product's own read of `24-17`'s runtime figures - `"unreachable"` covers both a genuine
 * network/server failure and (`ago-calendar` only) the backend not being configured on this
 * deployment at all, since this screen renders the same "this product's own figures are not
 * available right now" panel for either. */
type ProductSummaryState<T> =
  | { status: "loading" }
  | { status: "ok"; summary: T }
  | { status: "unreachable"; message: string };

interface FigureRow {
  label: string;
  value: string;
}

/**
 * `24-17`: the platform owner's own live read of `tenant-isolation.md`'s five headline figures -
 * `docs/architecture/tenant-isolation.md`'s own opening section now points here as the place to read
 * the *current* numbers, the document itself being a snapshot rather than the source from this item
 * onward.
 *
 * **The console adds the two products up** (`24-17`'s own Scope: "The console reads both products and
 * shows one combined figure"). Each product computes its own numbers, independently, from its own
 * currently-running assembly and route table - see `Ago.Chat.Api`'s `OwnerTenantIsolationEndpoints`
 * and `Ago.Calendar.Api`'s `OwnerTenantScopeEndpoints`, and their own C# remarks for why this is a
 * runtime read rather than a document.
 *
 * **The one rule this screen exists to hold:** a non-zero `unaccountedKeys` on the `ago-chat` side
 * must never sit beside an ordinary count with equal visual weight. Every plain figure below renders
 * in one calm table; `ago-chat`'s `Unaccounted` gets its own `Alert`, in `danger` tone with the exact
 * offending entry points listed, the moment it is not zero - and a *calm, explicit* `success` state
 * when it is, so a reader never has to infer "zero" from a number's mere absence. `ago-calendar`'s
 * `notGated` is rendered distinctly again, in `info` tone, with prose explaining it is not the same
 * kind of fact (`Ago.Calendar.Application.Abstractions.TenantScopeSnapshot`'s own remarks: no reasoned
 * exemption catalogue exists yet for this product, so an unclassified count is the honest ceiling on
 * what this screen can say about it - never inflated into a false "everything is fine" and never
 * conflated with `ago-chat`'s own real finding).
 *
 * **Gated the identical way as every other `/owner/*` screen.** `App.tsx`'s `RequireAuth` checks only
 * "is there an OIDC session"; each product's own `RequirePlatformOwner` policy is what actually
 * decides, per request, independently for each backend - so it is possible (if unusual) for one
 * product's figures to load while the other refuses, and this screen renders that combination
 * honestly rather than collapsing both into one access state.
 *
 * **`25-89`: no longer hardcoded English.** Reads `useStrings()` inside `App.tsx`'s own
 * `OwnerStringsProvider`, the identical change `OwnerSitesPage.tsx`'s own doc comment describes; see
 * that file and `OwnerStringsProvider.tsx` for the full reasoning. "AGO Chat"/"AGO Calendar" stay
 * untranslated throughout, deliberately - product names, the same exemption
 * `ux-gate/lib/i18nCompleteness.ts`'s own `EXEMPT_PHRASES` already gives "AGO"/"AGO Chat" elsewhere in
 * this console.
 */
export function OwnerTenantIsolationPage() {
  const { user, logout } = useAuth();
  const { siteId } = usePermissions();
  const strings = useStrings();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerAccess>("unknown");
  const [chat, setChat] = useState<ProductSummaryState<OwnerTenantIsolationSummary>>({ status: "loading" });
  const [calendar, setCalendar] = useState<ProductSummaryState<CalendarTenantScopeSummary>>({
    status: "loading",
  });

  const load = useCallback(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time this renders - the same "reaching here
      // is a wiring bug" reasoning every other owner page's own effect states.
      return;
    }

    // No synchronous `setChat({ status: "loading" })`/`setCalendar(...)` reset here, unlike this
    // function's own initial `useState` default - `load` is only ever invoked once, from the mount
    // effect below, so the "loading" state is already current by construction, and resetting it
    // synchronously inside an effect's own callback is exactly the cascading-render shape
    // `react-hooks/set-state-in-effect` (this console's own lint gate) flags. Nothing on this page
    // offers a "retry" action that would call `load` a second time yet.

    fetchOwnerTenantIsolationSummary(accessToken)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setAccess((prior) => (prior === "granted" ? prior : "refused"));
          setChat({ status: "unreachable", message: strings.ownerTenantIsolationNotAuthorizedShort });
          return;
        }
        setAccess("granted");
        setChat({ status: "ok", summary: outcome.summary });
      })
      .catch((err: unknown) => {
        setChat({
          status: "unreachable",
          message: err instanceof Error ? err.message : strings.ownerTenantIsolationChatLoadFailed,
        });
      });

    fetchOwnerTenantScopeSummary(accessToken)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setCalendar({ status: "unreachable", message: strings.ownerTenantIsolationNotAuthorizedShort });
          return;
        }
        if (outcome.status === "not-configured") {
          setCalendar({
            status: "unreachable",
            message: strings.ownerTenantIsolationCalendarNotConfigured,
          });
          return;
        }
        // `12-02`'s own owner screens grant access from the ago-chat call alone - this product's
        // figures are a bonus this screen adds up when reachable, never the gate itself, since a
        // platform owner may exist on a deployment with no calendar backend configured at all.
        setAccess((prior) => (prior === "refused" ? prior : "granted"));
        setCalendar({ status: "ok", summary: outcome.summary });
      })
      .catch((err: unknown) => {
        setCalendar({
          status: "unreachable",
          message: err instanceof Error ? err.message : strings.ownerTenantIsolationCalendarLoadFailed,
        });
      });
  }, [accessToken, strings]);

  useEffect(() => {
    load();
  }, [load]);

  const timeZone = resolveTimeZone();

  const chatOk = chat.status === "ok" ? chat.summary : null;
  const calendarOk = calendar.status === "ok" ? calendar.summary : null;

  /** Both backends set `generatedAtUtc` on every response (it is when the snapshot was computed,
   * never omitted) - `formatGeneratedAt` still goes through `parseInstant`'s own null-safe parse
   * rather than a bare `new Date(...)`, the same defensive shape every other timestamp render in
   * this console already uses, so a malformed value renders as "just now" rather than "Invalid
   * Date". */
  const formatGeneratedAt = (iso: string): string => {
    const parsed = parseInstant(iso);
    return parsed === null ? strings.ownerTenantIsolationJustNow : formatAbsolute(parsed, timeZone);
  };

  // `24-17`'s own Scope: "the console adds them up" - the combined figure, present only once both
  // products have actually answered, never a partial sum silently missing one side.
  const combined =
    chatOk && calendarOk
      ? {
          entryPoints: chatOk.entryPoints + calendarOk.entryPoints,
          handlerClasses: chatOk.handlerClasses + calendarOk.handlerClasses,
          rbacGated: chatOk.rbacGated + calendarOk.rbacGated,
        }
      : null;

  const chatFigureRows: FigureRow[] = chatOk
    ? [
        { label: strings.ownerTenantIsolationLabelEntryPoints, value: `${chatOk.entryPoints}` },
        { label: strings.ownerTenantIsolationLabelHandlerClasses, value: `${chatOk.handlerClasses}` },
        { label: strings.ownerTenantIsolationLabelRbacGated, value: `${chatOk.rbacGated}` },
        { label: strings.ownerTenantIsolationLabelExemptListed, value: `${chatOk.exemptListed}` },
        { label: strings.ownerTenantIsolationLabelRoutesHubMethods, value: `${chatOk.routesAndHubMethods}` },
        { label: strings.ownerTenantIsolationLabelClientSuppliedSiteId, value: `${chatOk.clientSuppliedSiteIdRoutes}` },
      ]
    : [];

  const calendarFigureRows: FigureRow[] = calendarOk
    ? [
        { label: strings.ownerTenantIsolationLabelEntryPoints, value: `${calendarOk.entryPoints}` },
        { label: strings.ownerTenantIsolationLabelHandlerClasses, value: `${calendarOk.handlerClasses}` },
        { label: strings.ownerTenantIsolationLabelRbacGated, value: `${calendarOk.rbacGated}` },
        { label: strings.ownerTenantIsolationLabelNotGated, value: `${calendarOk.notGated}` },
        { label: strings.ownerTenantIsolationLabelRoutesHubMethods, value: `${calendarOk.routesAndHubMethods}` },
        { label: strings.ownerTenantIsolationLabelClientSuppliedTenantId, value: `${calendarOk.clientSuppliedTenantIdRoutes}` },
      ]
    : [];

  const figureColumns: TableColumn<FigureRow>[] = [
    { key: "label", header: strings.ownerTenantIsolationColumnFigure, render: (row) => row.label },
    { key: "value", header: strings.ownerTenantIsolationColumnCount, render: (row) => row.value, align: "end" },
  ];

  return (
    <AppShell
      sections={[]}
      pinnedItem={access === "granted" ? { to: "/owner", label: strings.navPlatformSites, end: false } : undefined}
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={siteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && chat.status === "loading" && calendar.status === "loading" && (
        <Spinner label={strings.ownerTenantIsolationOpeningLabel} />
      )}

      {access === "refused" && (
        <>
          <PageHead title={strings.ownerTenantIsolationTitle} />
          <Alert tone="danger" title={strings.ownerNotAuthorizedTitle}>
            {strings.ownerTenantIsolationNotAuthorizedBody}
          </Alert>
        </>
      )}

      {access === "granted" && (
        <>
          <PageHead
            title={strings.ownerTenantIsolationTitle}
            description={strings.ownerTenantIsolationDescription}
          />

          {combined && (
            <Panel
              title={strings.ownerTenantIsolationCombinedTitle}
              description={strings.ownerTenantIsolationCombinedDescription}
            >
              <Table
                caption={strings.ownerTenantIsolationCombinedCaption}
                columns={figureColumns}
                rows={[
                  { label: strings.ownerTenantIsolationLabelEntryPoints, value: `${combined.entryPoints}` },
                  { label: strings.ownerTenantIsolationLabelHandlerClasses, value: `${combined.handlerClasses}` },
                  { label: strings.ownerTenantIsolationLabelRbacGated, value: `${combined.rbacGated}` },
                ]}
                rowKey={(row) => row.label}
              />
            </Panel>
          )}

          <Panel
            title="AGO Chat"
            description={
              chatOk
                ? `${strings.ownerTenantIsolationComputedPrefix}${formatGeneratedAt(chatOk.generatedAtUtc)}.`
                : undefined
            }
          >
            {chat.status === "loading" && <Spinner label={strings.ownerTenantIsolationChatLoadingLabel} />}
            {chat.status === "unreachable" && <Alert tone="info">{chat.message}</Alert>}
            {chatOk && (
              <div className="ago-stack">
                <Table
                  caption={strings.ownerTenantIsolationChatCaption}
                  columns={figureColumns}
                  rows={chatFigureRows}
                  rowKey={(row) => row.label}
                />

                {/* `24-17`'s own rule: this is the one finding on this screen that must never read
                    as equal in weight to a plain count. Rendered as its own Alert, danger when
                    non-zero, a calm explicit success when zero - never folded into the table
                    above. */}
                {chatOk.unaccountedKeys.length === 0 ? (
                  <Alert tone="success" title={strings.ownerTenantIsolationUnaccountedZeroTitle}>
                    {strings.ownerTenantIsolationUnaccountedZeroBody}
                  </Alert>
                ) : (
                  <Alert
                    tone="danger"
                    title={`${strings.ownerTenantIsolationUnaccountedPrefix}${chatOk.unaccountedKeys.length}`}
                  >
                    <p>{strings.ownerTenantIsolationUnaccountedBody}</p>
                    <ul>
                      {chatOk.unaccountedKeys.map((key) => (
                        <li key={key}>
                          <code>{key}</code>
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                {chatOk.exemptButAlsoLooksGated.length > 0 && (
                  <Alert
                    tone="info"
                    title={`${strings.ownerTenantIsolationStaleExemptionsPrefix}${chatOk.exemptButAlsoLooksGated.length}`}
                  >
                    <p>{strings.ownerTenantIsolationStaleExemptionsBody}</p>
                    <ul>
                      {chatOk.exemptButAlsoLooksGated.map((key) => (
                        <li key={key}>
                          <code>{key}</code>
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="AGO Calendar"
            description={
              calendarOk
                ? `${strings.ownerTenantIsolationComputedPrefix}${formatGeneratedAt(calendarOk.generatedAtUtc)}.`
                : undefined
            }
          >
            {calendar.status === "loading" && <Spinner label={strings.ownerTenantIsolationCalendarLoadingLabel} />}
            {calendar.status === "unreachable" && <Alert tone="info">{calendar.message}</Alert>}
            {calendarOk && (
              <div className="ago-stack">
                <Table
                  caption={strings.ownerTenantIsolationCalendarCaption}
                  columns={figureColumns}
                  rows={calendarFigureRows}
                  rowKey={(row) => row.label}
                />

                {/* Deliberately `info` tone, never `danger`, and deliberately never rendered as
                    "Unaccounted" - this product has no reasoned exemption catalogue for a runtime
                    read to cross-reference against, so this count mixes legitimate design (worker
                    and public-booking handlers) with anything genuinely unreviewed,
                    indistinguishably. Reading it as equivalent to AGO Chat's own Unaccounted above
                    would be exactly the false alarm (or false reassurance) this screen exists to
                    prevent. */}
                <Alert tone="info" title={`${strings.ownerTenantIsolationNotGatedPrefix}${calendarOk.notGated}`}>
                  <p>{strings.ownerTenantIsolationNotGatedBody}</p>
                  {calendarOk.notGatedKeys.length > 0 && (
                    <details>
                      <summary>
                        {calendarOk.notGatedKeys.length}
                        {strings.ownerTenantIsolationEntryPointsSuffix}
                      </summary>
                      <ul>
                        {calendarOk.notGatedKeys.map((key) => (
                          <li key={key}>
                            <code>{key}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Alert>
              </div>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
