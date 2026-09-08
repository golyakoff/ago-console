import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getPhoneReveals, type PhoneReveal } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, formatClockTime, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `23-30`/`23-12`: `/calendar/phone-reveals` - the reveal audit trail, the fifth screen this item
 * adds beside the four masked-value-and-reveal ones. There is no chat-side precedent to copy for
 * *this* screen specifically (`ago-chat` has no console read of its own `contact_reveals` table yet)
 * so its own shape follows this console's nearest existing sibling instead: `SearchConversationsPage`'s
 * keyset "Load more" pattern (`nextBeforeMessageId`/`handleLoadMore`), the one other screen in this
 * console that pages a server-side cursor rather than loading everything at once.
 *
 * <b>Individual reveals, never a count.</b> `decisions.md` §5's own amendment: "reveal counts belong
 * in an audit view, never in the report a person is judged on" - and this *is* that audit view, so it
 * deliberately shows one row per reveal and nothing aggregated per operator, the same restraint
 * `GetPhoneRevealsForTenantHandler`'s own doc comment states server-side.
 *
 * <b>Gated on `calendar:configure`, not `customer:read`.</b> Wider than the reveal action itself, on
 * purpose (`GetPhoneRevealsForTenantHandler`'s own doc comment: revealing one number does not entitle
 * somebody to the whole tenant's reveal history). `consoleNav.ts`'s `buildCalendarItems` draws this
 * entry only in the full `calendar:configure` branch, so the client-side gate below matches exactly
 * what the nav promises - `CalendarContactsPage`'s own `23-57` doc comment names the same discipline.
 *
 * <b>Forbidden, never an empty list, for a caller who lacks it.</b> The client-side gate below is
 * what makes that true: an operator without `calendar:configure` never issues the request at all and
 * sees `CalendarAccessRefusal` instead - the identical shape every other calendar screen in this
 * console already uses for its own forbidden state, not `ContactDetailsPanel`'s bare "renders
 * nothing" (that would look identical to a genuinely empty audit trail, which is exactly the
 * ambiguity this item's own Done-when rules out).
 */
export function CalendarPhoneRevealsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [reveals, setReveals] = useState<PhoneReveal[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canView = hasPermission("calendar:configure");

  const load = useCallback(
    async (before?: string, signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      if (before !== undefined) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const page = await getPhoneReveals(accessToken, before, undefined, signal);
        setReveals((prev) => (before !== undefined ? [...prev, ...page.items] : page.items));
        setNextBefore(page.nextBefore);
        setHasLoaded(true);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.access_token, strings],
  );

  useEffect(() => {
    if (!canView || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    // `23-100`: the same deliberate, per-line suppression every other calendar screen's own mount
    // effect carries - see `CalendarQueuePage.tsx`'s identical comment for the full reasoning. Loads
    // the first page of this screen's own reveal audit trail.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load, canView]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!canView) {
    // `23-21`: the shared refusal - see `calendarAccess.tsx`'s own doc comment. This is what makes
    // "forbidden" and "empty" visibly different, the item's own Done-when.
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarPhoneReveals}
        forbiddenMessage={strings.calendarPhoneRevealsForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarPhoneReveals} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const columns: TableColumn<PhoneReveal>[] = [
    {
      key: "when",
      header: strings.calendarPhoneRevealsColumnWhen,
      render: (row) => {
        const instant = parseInstant(row.occurredAt);
        return instant === null ? "—" : (
          <span title={formatAbsolute(instant, timeZone, strings)}>{formatClockTime(instant, timeZone, strings)}</span>
        );
      },
    },
    {
      key: "customer",
      header: strings.calendarPhoneRevealsColumnCustomer,
      render: (row) => <span className="ago-mono">{row.customerId.slice(0, 8)}</span>,
    },
    {
      key: "operator",
      header: strings.calendarPhoneRevealsColumnOperator,
      render: (row) => <span className="ago-mono">{row.operatorId.slice(0, 8)}</span>,
    },
    { key: "surface", header: strings.calendarPhoneRevealsColumnSurface, render: (row) => row.surface },
  ];

  return (
    <>
      <PageHead title={strings.navCalendarPhoneReveals} description={strings.calendarPhoneRevealsDescription} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : reveals.length === 0 && hasLoaded ? (
        <Panel>
          <p className="ago-meta">{strings.calendarPhoneRevealsEmpty}</p>
        </Panel>
      ) : reveals.length > 0 ? (
        <Table caption={strings.calendarPhoneRevealsDescription} columns={columns} rows={reveals} rowKey={(row) => row.id} />
      ) : null}

      {nextBefore !== null && (
        <div className="ago-row">
          <Button variant="secondary" onClick={() => void load(nextBefore)} disabled={loadingMore}>
            {loadingMore ? strings.calendarPhoneRevealsLoadingMoreLabel : strings.calendarPhoneRevealsLoadMoreButton}
          </Button>
        </div>
      )}
    </>
  );
}
