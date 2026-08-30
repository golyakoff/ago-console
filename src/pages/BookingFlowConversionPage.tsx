import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchBookingFlowReport } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** The identical `<input type="date">` -> half-open ISO bound helpers `OperatorAnalyticsPage` already
 * establishes for `18-08`'s own date-range form - restated here rather than shared across two files
 * for two four-line functions, matching that file's own "not worth the coupling" precedent (itself
 * inherited from `SearchConversationsPage`). */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

/**
 * `18-14`: `/analytics/booking-flow` - the chat-to-booking conversion report: how many conversations
 * started `20-07`'s calendar module flow, and how many of those flows closed, over a date range.
 * Gated on `site:configure`, the same permission `OperatorAnalyticsPage` already uses for the
 * identical "site-wide oversight, not an ordinary operator's own view" reasoning
 * (`GetModuleFlowReportForSiteHandler`'s own remarks, `ago-chat`).
 *
 * <b>Its own page, not a block inside `OperatorAnalyticsPage`.</b> The backlog item's own Scope is
 * explicit: this report's honesty caveat ("flow closed" is not "booked") must stay visually distinct
 * from `/analytics`'s numbers, not sit in a shared table where a reader could apply one report's
 * caveat to the other's. A second table on the same page was the alternative
 * `OperatorAnalyticsPage`'s own doc comment used for `18-09`'s per-operator breakdown - rejected here
 * because that precedent is for two breakdowns of *the same* well-understood numbers; this report is
 * a structurally different question (`IBookingFlowReadStore`'s own remarks on why `module_tasks` is
 * not `conversations`), and folding it into that page's file would have meant editing
 * `OperatorAnalyticsPage.tsx` itself for a change that has nothing to do with what that file already
 * reports on.
 *
 * <b>The caveat is an `Alert`, not a footnote.</b> `tone="info"` renders it as its own visually
 * distinct callout beside the two numbers, not a caption a reader can skim past - the same
 * "the honesty caveat lives in the text a site owner actually reads" requirement the backlog item's
 * own Done-when states explicitly.
 *
 * <b>Two numbers, not a table.</b> Unlike `OperatorAnalyticsPage`'s per-channel/per-operator
 * breakdowns, this report has no dimension to split by - `IBookingFlowReadStore` returns exactly one
 * pair of counts for the whole site and window, so a `Table` component built for many rows would be
 * the wrong tool; a plain `<dl>` is the honest shape for two numbers.
 *
 * <b>The date-range form is UX-only</b>, the same call `OperatorAnalyticsPage`/`SearchConversationsPage`
 * already make: `GetModuleFlowReportForSiteHandler` is the real authority (`from >= to` is its own
 * `400 ModuleFlow.InvalidRange`), and this page always renders the range the *response* echoes back,
 * never the raw values typed into the two inputs.
 */
export function BookingFlowConversionPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const [flowsStarted, setFlowsStarted] = useState<number | null>(null);
  const [flowsClosed, setFlowsClosed] = useState<number | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = hasPermission("site:configure");

  const runReport = useCallback(
    async (range: { from?: string; to?: string }) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchBookingFlowReport(accessToken, range);
        setFlowsStarted(response.flowsStarted);
        setFlowsClosed(response.flowsClosed);
        setEffectiveFrom(response.from);
        setEffectiveTo(response.to);
      } catch (err) {
        if (err instanceof ApiProblemError && err.code === "Conversation.Forbidden") {
          setError(strings.bookingFlowForbiddenError);
        } else if (err instanceof ApiProblemError && err.code === "ModuleFlow.InvalidRange") {
          setError(strings.bookingFlowInvalidRangeError);
        } else {
          setError(strings.bookingFlowLoadError);
        }
      } finally {
        setLoading(false);
      }
    },
    [user?.access_token, strings],
  );

  // Loads the server's own default window (`GetModuleFlowReportForSiteHandler.DefaultWindowDays`) on
  // first render, exactly once permission is confirmed - the same "an owner opens this to see
  // something immediately" first paint `OperatorAnalyticsPage` already does for `18-08`.
  useEffect(() => {
    if (allowed) {
      void runReport({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runReport({
      from: fromInput ? startOfDayIso(fromInput) : undefined,
      to: toInput ? endOfDayIso(toInput) : undefined,
    });
  };

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!allowed) {
    return (
      <>
        <PageHead title={strings.navBookingFlow} />
        <Alert tone="danger">{strings.bookingFlowForbiddenError}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const effectiveFromAt = parseInstant(effectiveFrom);
  const effectiveToAt = parseInstant(effectiveTo);

  return (
    <>
      <PageHead title={strings.navBookingFlow} description={strings.bookingFlowPageDescription} />

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <Field label={strings.bookingFlowFromFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Field label={strings.bookingFlowToFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" disabled={loading}>
          {strings.bookingFlowApplyButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {effectiveFromAt && effectiveToAt && (
        <p className="ago-meta">
          {strings.bookingFlowRangeLabel} {formatDateStamp(effectiveFromAt, timeZone)} –{" "}
          {formatDateStamp(effectiveToAt, timeZone)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={3} label={strings.bookingFlowLoadingLabel} />
      ) : flowsStarted === 0 ? (
        <p className="ago-empty">{strings.bookingFlowEmpty}</p>
      ) : flowsStarted !== null && flowsClosed !== null ? (
        <>
          <dl className="ago-booking-flow-stats">
            <div>
              <dt>{strings.bookingFlowStartedLabel}</dt>
              <dd>{flowsStarted}</dd>
            </div>
            <div>
              <dt>{strings.bookingFlowClosedLabel}</dt>
              <dd>{flowsClosed}</dd>
            </div>
          </dl>

          <Alert tone="info">{strings.bookingFlowCaveat}</Alert>
        </>
      ) : null}
    </>
  );
}
