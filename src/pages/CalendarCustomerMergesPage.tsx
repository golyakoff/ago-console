import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getCustomerMerges, type CustomerMergeRecord } from "../api/calendarApi.js";
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
 * `23-60`/`adr/0161`: `/calendar/customer-merges` - the merge audit trail `adr/0147`'s own "a merge
 * that cannot be explained afterwards is a merge nobody will trust" calls for. Built directly on
 * `CalendarPhoneRevealsPage`'s own shape - the same keyset "Load more" pattern, the same
 * `calendar:configure` gate wider than the action itself, and the same reasoning for both: nothing
 * chat-side to copy, and this console's own nearest sibling already solved this exact screen shape.
 *
 * <b>Gated on `calendar:configure`, not `customer:edit`.</b> Wider than the merge action itself, on
 * purpose (`GetCustomerMergesForTenantHandler`'s own doc comment: merging one pair of records does
 * not entitle somebody to the tenant's whole merge history). `consoleNav.ts`'s `buildCalendarItems`
 * draws this entry only in the full `calendar:configure` branch, so the client-side gate below
 * matches exactly what the nav promises.
 */
export function CalendarCustomerMergesPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [merges, setMerges] = useState<CustomerMergeRecord[]>([]);
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
        const page = await getCustomerMerges(accessToken, before, undefined, signal);
        setMerges((prev) => (before !== undefined ? [...prev, ...page.items] : page.items));
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
    // effect carries - see `CalendarPhoneRevealsPage.tsx`'s identical comment for the full reasoning.
    // Loads the first page of this screen's own merge audit trail.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load, canView]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!canView) {
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarCustomerMerges}
        forbiddenMessage={strings.calendarCustomerMergesForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarCustomerMerges} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const columns: TableColumn<CustomerMergeRecord>[] = [
    {
      key: "when",
      header: strings.calendarCustomerMergesColumnWhen,
      render: (row) => {
        const instant = parseInstant(row.mergedAt);
        return instant === null ? "—" : (
          <span title={formatAbsolute(instant, timeZone, strings)}>{formatClockTime(instant, timeZone, strings)}</span>
        );
      },
    },
    {
      key: "survivor",
      header: strings.calendarCustomerMergesColumnSurvivor,
      render: (row) => <span className="ago-mono">{row.survivorCustomerId.slice(0, 8)}</span>,
    },
    {
      key: "absorbed",
      header: strings.calendarCustomerMergesColumnAbsorbed,
      render: (row) => <span className="ago-mono">{row.absorbedCustomerId.slice(0, 8)}</span>,
    },
    {
      key: "operator",
      header: strings.calendarCustomerMergesColumnOperator,
      render: (row) => <span className="ago-mono">{row.operatorId.slice(0, 8)}</span>,
    },
    { key: "bookingsMoved", header: strings.calendarCustomerMergesColumnBookingsMoved, render: (row) => row.bookingsMoved, align: "end" },
  ];

  return (
    <>
      <PageHead title={strings.navCalendarCustomerMerges} description={strings.calendarCustomerMergesDescription} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : merges.length === 0 && hasLoaded ? (
        <Panel>
          <p className="ago-meta">{strings.calendarCustomerMergesEmpty}</p>
        </Panel>
      ) : merges.length > 0 ? (
        <Table caption={strings.calendarCustomerMergesDescription} columns={columns} rows={merges} rowKey={(row) => row.id} />
      ) : null}

      {nextBefore !== null && (
        <div className="ago-row">
          <Button variant="secondary" onClick={() => void load(nextBefore)} disabled={loadingMore}>
            {loadingMore ? strings.calendarCustomerMergesLoadingMoreLabel : strings.calendarCustomerMergesLoadMoreButton}
          </Button>
        </div>
      )}
    </>
  );
}
