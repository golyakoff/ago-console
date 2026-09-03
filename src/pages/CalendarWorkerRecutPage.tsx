import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  CalendarApiError,
  previewRecutSchedule,
  recutSchedule,
  type RecutBookingPreview,
  type RecutDayPreview,
  type RecutPreviewResult,
  type RecutResult,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { renderCustomer, renderPhone, slotStatusLabel } from "../calendar/calendarFormat.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatClockTime, parseInstant, resolveTimeZone } from "../time/format.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Decision = "Cancel" | "Keep";

/**
 * `22-06`/`adr/0093`: `/calendar/workers/:workerId/recut` - the one deliberate, human-triggered
 * exception to the forward-only materialisation cursor, moved from `ago-calendar-console`'s own
 * `WorkerRecutPage.tsx` and rewritten against this console's closed eleven-component set.
 *
 * <b>Three steps, and the middle one cannot be skipped by typing faster.</b> Unchanged from the
 * source: pick a date and preview; decide cancel-or-keep for every booking found; review a summary
 * before the destructive call fires.
 *
 * <b>The confirmation is a second panel, not a `Dialog`.</b> Same reasoning as
 * `CalendarWorkersPage.tsx`'s own delete confirmation - consistency with this console's existing
 * inline-confirmation shape over introducing a modal for one screen.
 */
export function CalendarWorkerRecutPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);

  const [from, setFrom] = useState(today);
  const [preview, setPreview] = useState<RecutPreviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RecutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(
    async (event?: { preventDefault(): void }) => {
      event?.preventDefault();
      const accessToken = user?.access_token;
      if (!accessToken || workerId === undefined) {
        return;
      }

      setBusy(true);
      setError(null);
      setResult(null);
      setConfirming(false);

      try {
        const loaded = await previewRecutSchedule(accessToken, workerId, from);
        setPreview(loaded);
        setDecisions({});
      } catch (reason) {
        setPreview(null);
        setError(calendarErrorMessage(reason, strings));
      } finally {
        setBusy(false);
      }
    },
    [user?.access_token, workerId, from, strings],
  );

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <>
        <PageHead title={strings.calendarRecutTitle} />
        <Alert tone="danger">{strings.calendarWorkerRecutForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.calendarRecutTitle} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const decidableBookings = (preview?.days ?? []).flatMap((day) => day.bookings.filter((b) => b.canDecide));
  const everyDecisionMade = decidableBookings.every((booking) => decisions[booking.bookingId] !== undefined);

  const daysToBeRecut = (preview?.days ?? []).filter((day) => !dayIsKept(day, decisions));
  const daysToBeSkipped = (preview?.days ?? []).filter((day) => dayIsKept(day, decisions));
  const bookingsToBeCancelled = decidableBookings.filter((b) => decisions[b.bookingId] === "Cancel").length;
  const availableSlotsToDelete = daysToBeRecut.reduce((sum, day) => sum + day.availableSlotsToDelete, 0);

  const handleConfirm = async () => {
    const accessToken = user?.access_token;
    if (!accessToken || workerId === undefined || preview === null) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const applied = await recutSchedule(accessToken, workerId, {
        from,
        fingerprint: preview.fingerprint,
        decisions: decidableBookings.map((booking) => ({ bookingId: booking.bookingId, decision: decisions[booking.bookingId] })),
      });
      setResult(applied);
      setPreview(null);
      setDecisions({});
      setConfirming(false);
    } catch (reason) {
      if (reason instanceof CalendarApiError && reason.code === "recut.stale") {
        setPreview(null);
        setDecisions({});
        setConfirming(false);
      }

      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={strings.calendarRecutTitle} description={strings.calendarRecutDescription} />

      <p>
        <Link to="/calendar/workers">← {strings.navCalendarWorkers}</Link>
      </p>

      <Panel>
        <form className="ago-row" onSubmit={(event) => void loadPreview(event)}>
          <Field label={strings.calendarRecutFromFieldLabel}>
            {(controlProps) => <Input {...controlProps} type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />}
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {strings.calendarPreviewButton}
          </Button>
        </form>
      </Panel>

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {result !== null && (
        <Panel title={strings.calendarRecutDoneTitle}>
          <p>
            {result.recutDays.length}
            {strings.calendarRecutSummaryDaysRecutSuffix}
            {result.skippedDays.length}
            {strings.calendarRecutSummaryDaysLeftSuffix}
            {result.slotsDeleted}
            {strings.calendarRecutSummarySlotsDeletedSuffix}
            {result.slotsInserted}
            {strings.calendarRecutSummarySlotsInsertedSuffix}
            {result.bookingsCancelled}
            {strings.calendarRecutSummaryBookingsCancelledSuffix}
          </p>
          {result.skippedDays.length > 0 && (
            <p className="ago-meta">
              {strings.calendarRecutLeftInOldGridPrefix}
              {result.skippedDays.join(", ")}
              {strings.calendarRecutLeftInOldGridSuffix}
            </p>
          )}
        </Panel>
      )}

      {preview !== null && !confirming && (
        <>
          {preview.days.every((day) => day.bookings.length === 0) && preview.days.every((day) => day.availableSlotsToDelete === 0) && (
            <Alert tone="info">{strings.calendarRecutNothingGeneratedNote}</Alert>
          )}

          {preview.days.map((day) => (
            <RecutDayRow
              key={day.localDate}
              day={day}
              decisions={decisions}
              strings={strings}
              timeZone={timeZone}
              onDecide={(bookingId, decision) => setDecisions((current) => ({ ...current, [bookingId]: decision }))}
            />
          ))}

          <div className="ago-row">
            <Button variant="primary" disabled={busy || !everyDecisionMade} onClick={() => setConfirming(true)}>
              {strings.calendarReviewAndConfirmButton}
            </Button>
          </div>
          {!everyDecisionMade && <p className="ago-meta">{strings.calendarRecutChooseDecisionNote}</p>}
        </>
      )}

      {preview !== null && confirming && (
        <Panel title={strings.calendarRecutConfirmTitle}>
          <p>
            {strings.calendarRecutConfirmPrefix}
            <strong>{daysToBeRecut.length}</strong>
            {strings.calendarRecutConfirmDaysSuffix}
            <strong>{availableSlotsToDelete}</strong>
            {strings.calendarRecutConfirmSlotsSuffix}
            <strong>{bookingsToBeCancelled}</strong>
            {strings.calendarRecutConfirmBookingsSuffix}
            <strong>{daysToBeSkipped.length}</strong>
            {strings.calendarRecutConfirmSkippedSuffix}
          </p>
          <Alert tone="danger">{strings.calendarRecutCannotBeUndoneNote}</Alert>
          <div className="ago-row">
            <Button variant="danger" disabled={busy} onClick={() => void handleConfirm()}>
              {strings.calendarConfirmRecutButton}
            </Button>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              {strings.calendarBackButton}
            </Button>
          </div>
        </Panel>
      )}
    </>
  );
}

function dayIsKept(day: RecutDayPreview, decisions: Record<string, Decision>): boolean {
  return day.bookings.some((booking) => !booking.canDecide || decisions[booking.bookingId] === "Keep");
}

function RecutDayRow({
  day,
  decisions,
  strings,
  timeZone,
  onDecide,
}: {
  day: RecutDayPreview;
  decisions: Record<string, Decision>;
  strings: ConsoleStrings;
  timeZone: string | null;
  onDecide: (bookingId: string, decision: Decision) => void;
}) {
  const kept = dayIsKept(day, decisions);

  return (
    <Panel title={day.localDate} description={kept ? strings.calendarRecutDayKeptNote : undefined}>
      <p className="ago-meta">
        {day.availableSlotsToDelete}
        {strings.calendarRecutDaySlotsToDeleteSuffix}
      </p>

      {day.bookings.length === 0 && <p className="ago-meta">{strings.calendarRecutNoBookingsNote}</p>}

      <div className="ago-stack">
        {day.bookings.map((booking) => (
          <RecutBookingRow
            key={booking.bookingId}
            booking={booking}
            decision={decisions[booking.bookingId]}
            strings={strings}
            timeZone={timeZone}
            onDecide={(decision) => onDecide(booking.bookingId, decision)}
          />
        ))}
      </div>
    </Panel>
  );
}

function RecutBookingRow({
  booking,
  decision,
  strings,
  timeZone,
  onDecide,
}: {
  booking: RecutBookingPreview;
  decision: Decision | undefined;
  strings: ConsoleStrings;
  timeZone: string | null;
  onDecide: (decision: Decision) => void;
}) {
  const groupName = `recut-decision-${booking.bookingId}`;
  const startsAt = parseInstant(booking.startsAt);
  const endsAt = parseInstant(booking.endsAt);

  return (
    <div className="ago-row">
      {/* Each field its own element, not a run of sibling text nodes inside one span - unchanged from
          the source. */}
      <span title={startsAt ? formatAbsolute(startsAt, timeZone, strings) : undefined}>
        {startsAt ? formatClockTime(startsAt, timeZone, strings) : "—"} – {endsAt ? formatClockTime(endsAt, timeZone, strings) : "—"}
      </span>
      <span>{booking.serviceName ?? <span className="ago-meta">—</span>}</span>
      <span>{renderCustomer(booking, strings)}</span>
      <span>{renderPhone(booking, strings)}</span>
      <span className="ago-meta">({slotStatusLabel(booking.status, strings)})</span>
      {booking.canDecide ? (
        <span className="ago-row">
          <label>
            <input type="radio" name={groupName} value="Cancel" checked={decision === "Cancel"} onChange={() => onDecide("Cancel")} />
            {" "}{strings.calendarCancelDecisionLabel}
          </label>
          <label>
            <input type="radio" name={groupName} value="Keep" checked={decision === "Keep"} onChange={() => onDecide("Keep")} />
            {" "}{strings.calendarKeepDecisionLabel}
          </label>
        </span>
      ) : (
        <span className="ago-meta">{strings.calendarAlreadyNoShowNote}</span>
      )}
    </div>
  );
}
