import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton } from "../components/Spinner.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import type { WorkerSlot } from "../api/calendarApi.js";
import { formatClockTime, parseInstant } from "../time/format.js";

/** `26-210`/`adr/0187`: the one permission this action checks - a new, distinct string from
 * `booking:cancel` (`adr/0187`'s own alternatives-considered: "reschedule *contains* a cancel" was
 * weighed and rejected, because a tenant may want a senior operator to move an appointment without
 * granting it to a junior, independently of who may cancel). Matches
 * `Ago.Calendar.Domain.Permission.BookingReschedule`/`Ago.Chat.Domain.Permission.BookingReschedule`
 * byte-for-byte (`adr/0093`). */
export const RESCHEDULE_BOOKING_PERMISSION = "booking:reschedule";

export interface RescheduleBookingButtonProps {
  /** The booking's own current business-local day (`ConfirmedBooking.localDate`) - the picker's
   * starting point, reset onto it every time the dialog is reopened, so a stale date from a previous
   * attempt on a different row is never carried over. */
  initialDate: string;
  /** The zone the row's own "when" column already renders in (`CalendarBookingsPage`'s own
   * `timeZone`) - passed through rather than recomputed, so a picked slot's time reads the same way
   * here as it does on the row it was picked for. */
  timeZone: string | null;
  /**
   * Reads the same worker's own materialised grid for one day - the identical read
   * `CalendarWorkerSlotsPage` already makes (`getWorkerSlots`), injected rather than imported here so
   * this component takes no access token and no API module. `CloseConversationButton.tsx`'s own doc
   * comment states the reasoning this follows: "the page owns the request, this owns the interaction
   * around it".
   */
  onLoadSlots: (date: string, signal: AbortSignal) => Promise<WorkerSlot[]>;
  /** Runs the actual move, naming the picked slot by its own `eventId`. */
  onReschedule: (newStartEventId: string) => Promise<void>;
  /** Told once the move succeeded, so the page can re-read the confirmed-bookings range and show the
   * booking at its new time. */
  onRescheduled: () => void;
}

/**
 * `26-210`/`adr/0187`: `CalendarBookingsPage`'s first row action - «Перенести», on a `Booked` row.
 *
 * <b>Hidden, not disabled, without `booking:reschedule`.</b> The same idiom every permission-gated
 * row control in this console already uses (`CloseConversationButton`/`BlockVisitorButton`): an
 * operator who does not hold the permission sees no affordance at all, not a greyed-out button.
 *
 * <b>The picker names a slot, never a wall-clock instant.</b> `POST .../reschedule` takes
 * `newStartEventId` - the grid row's own id, the identical value `WorkerSlot.eventId` already carries
 * on every row `getWorkerSlots` returns (`calendarApi.ts`'s own doc comment on `rescheduleBooking`).
 * This dialog therefore only ever offers slots the server itself just listed as `Available` for this
 * worker on the chosen day - never a time typed free-hand - so the id sent back is always one the
 * server actually produced.
 *
 * <b>Same worker only - v1's own scope (`adr/0187` §Decision).</b> The booking's own `workerId` is
 * never a choice in this dialog; the caller (`CalendarBookingsPage`) closes over it when it builds
 * `onLoadSlots`/`onReschedule`, so there is no control here that could send a different one. A target
 * on another worker is refused server-side (`DifferentWorker`) as a defence-in-depth backstop, not a
 * path this UI offers.
 *
 * <b>A courtesy read, not the availability decision.</b> The slot list below is exactly that - a
 * courtesy read (`adr/0187` rule-8 remarks) - the server's own atomic claim inside the write
 * transaction is what actually decides. Losing that race is an ordinary, expected outcome
 * (`calendarRescheduleSlotUnavailableError`), not a fault this component treats specially beyond
 * naming it - the operator picks another slot and tries again.
 */
export function RescheduleBookingButton({
  initialDate,
  timeZone,
  onLoadSlots,
  onReschedule,
  onRescheduled,
}: RescheduleBookingButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<WorkerSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    // Loads the chosen day's grid the moment the dialog opens or the date field changes. `23-100`'s
    // own reasoning for the identical shape on every calendar screen's own loader applies unchanged
    // here: every `setState` below runs after an `await`, never synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots(null);
    setLoadError(null);
    setSelectedEventId(null);
    onLoadSlots(date, controller.signal)
      .then((rows) => setSlots(rows))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setLoadError(calendarErrorMessage(reason, strings));
        }
      });
    return () => controller.abort();
  }, [open, date, onLoadSlots, strings]);

  if (!hasPermission(RESCHEDULE_BOOKING_PERMISSION)) {
    return null;
  }

  const availableSlots = (slots ?? []).filter((slot) => slot.status === "Available");

  const attempt = async () => {
    if (selectedEventId === null) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onReschedule(selectedEventId);
      setOpen(false);
      onRescheduled();
    } catch (reason) {
      setSubmitError(calendarErrorMessage(reason, strings));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setDate(initialDate);
          setSubmitError(null);
          setOpen(true);
        }}
      >
        {strings.calendarRescheduleButton}
      </Button>

      <Dialog
        open={open}
        title={strings.calendarRescheduleDialogTitle}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {strings.cancelButton}
            </Button>
            <Button onClick={() => void attempt()} disabled={submitting || selectedEventId === null}>
              {strings.calendarRescheduleButton}
            </Button>
          </>
        }
      >
        <Field label={strings.calendarRescheduleDateFieldLabel}>
          {(controlProps) => (
            <Input {...controlProps} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          )}
        </Field>

        {loadError !== null && <Alert tone="danger">{loadError}</Alert>}

        {slots === null && loadError === null ? (
          <Skeleton lines={3} label={strings.calendarLoading} />
        ) : availableSlots.length === 0 && loadError === null ? (
          <p className="ago-meta">{strings.calendarRescheduleNoSlotsLabel}</p>
        ) : (
          <div className="ago-row" role="radiogroup" aria-label={strings.calendarRescheduleSlotsLabel}>
            {availableSlots.map((slot) => {
              const startsAt = parseInstant(slot.startsAt);
              const label = startsAt ? formatClockTime(startsAt, timeZone, strings) : slot.startsAt;
              const selected = selectedEventId === slot.eventId;
              return (
                <Button
                  key={slot.eventId}
                  size="sm"
                  variant={selected ? "primary" : "secondary"}
                  aria-pressed={selected}
                  onClick={() => setSelectedEventId(slot.eventId)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        )}

        {submitError !== null && <Alert tone="danger">{submitError}</Alert>}
      </Dialog>
    </>
  );
}
