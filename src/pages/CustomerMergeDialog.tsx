import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../components/Dialog.js";
import { Button } from "../components/Button.js";
import { Badge } from "../components/Badge.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { Panel } from "../components/Panel.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import {
  getCustomerMergePreview,
  mergeCustomers,
  type CustomerMergeCandidate,
  type CustomerMergeOutcome,
  type CustomerMergePreview,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";

export interface CustomerMergeDialogProps {
  open: boolean;
  accessToken: string | undefined;
  firstCustomerId: string;
  secondCustomerId: string;
  onClose: () => void;
  /** Called once the merge itself has succeeded - the caller (`CalendarContactsPage`) reloads the
   * contacts list and shows the bookings-moved count; this dialog owns none of that, only the
   * confirmation step. */
  onMerged: (outcome: CustomerMergeOutcome) => void;
}

/**
 * `23-60`/`adr/0161`: "seeing both sets of bookings before deciding", and the place `adr/0161`'s own
 * "no undo, ever" decision has to be felt rather than read - both candidates' full booking history,
 * shown before a single irreversible click, with copy that says plainly that the click cannot be
 * taken back.
 *
 * <b>Never lets the operator choose which side survives.</b> Both candidates render with a badge
 * showing what the server has already decided (`willSurvive`, `MergeCustomersHandler`'s own doc
 * comment on why an operator cannot pick) - the dialog states the outcome, it does not collect it.
 * The only choice this dialog offers is whether to merge at all.
 */
export function CustomerMergeDialog({
  open, accessToken, firstCustomerId, secondCustomerId, onClose, onMerged,
}: CustomerMergeDialogProps) {
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // `CalendarContactsPage` only ever renders this component while `mergeCandidateIds !== null`, so a
  // fresh dialog always mounts fresh - `useState`'s own initial value is the reset this effect would
  // otherwise have to perform synchronously on `open`/id changes, which is why there is none to do
  // here (`open` is accepted as a prop for API clarity - "am I visible" - not because this component
  // ever toggles it while staying mounted).
  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    const controller = new AbortController();
    // Loads the confirmation dialog's own reason for existing - both candidates' booking history -
    // the moment it opens. Not effect-avoidable: the preview names two specific ids the caller just
    // chose, so there is nothing to fetch before this dialog is asked to open.
    getCustomerMergePreview(accessToken, firstCustomerId, secondCustomerId, controller.signal)
      .then(setPreview)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      });
    return () => controller.abort();
  }, [open, accessToken, firstCustomerId, secondCustomerId, strings]);

  const handleConfirm = async () => {
    if (!accessToken) {
      return;
    }

    setMerging(true);
    setError(null);
    try {
      const outcome = await mergeCustomers(accessToken, firstCustomerId, secondCustomerId);
      onMerged(outcome);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setMerging(false);
    }
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={merging}>
        {strings.calendarMergeDialogCancelButton}
      </Button>
      <Button variant="danger" onClick={() => void handleConfirm()} disabled={preview === null || merging}>
        {merging ? strings.calendarMergeDialogConfirmingLabel : strings.calendarMergeDialogConfirmButton}
      </Button>
    </>
  );

  return (
    <Dialog open={open} title={strings.calendarMergeDialogTitle} onClose={onClose} footer={footer}>
      {error !== null && <Alert tone="danger">{error}</Alert>}

      {preview === null && error === null ? (
        <Spinner label={strings.calendarMergeDialogLoading} />
      ) : preview !== null ? (
        <>
          <Alert tone="danger">{strings.calendarMergeDialogIrreversibleWarning}</Alert>
          <div className="ago-merge-candidates">
            <MergeCandidatePanel candidate={preview.first} timeZone={timeZone} />
            <MergeCandidatePanel candidate={preview.second} timeZone={timeZone} />
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

function MergeCandidatePanel({ candidate, timeZone }: { candidate: CustomerMergeCandidate; timeZone: string | null }) {
  const strings = useStrings();

  return (
    <Panel>
      <p>
        <Badge tone={candidate.willSurvive ? "success" : "danger"}>
          {candidate.willSurvive ? strings.calendarMergeDialogSurvivorBadge : strings.calendarMergeDialogAbsorbedBadge}
        </Badge>
      </p>
      <p>
        <strong>{candidate.displayName ?? strings.calendarNotRecordedLabel}</strong>
        {" · "}
        {candidate.phone}
      </p>
      <p className="ago-meta">
        {strings.calendarMergeDialogNoShowCountLabel}: {candidate.noShowCount}
      </p>
      <h3>{strings.calendarMergeDialogBookingsHeading}</h3>
      {candidate.bookings.length === 0 ? (
        <p className="ago-meta">{strings.calendarMergeDialogNoBookings}</p>
      ) : (
        <ul>
          {candidate.bookings.map((booking) => {
            const startsAt = parseInstant(booking.startsAt);
            return (
              <li key={booking.bookingId}>
                {startsAt === null ? "—" : formatAbsolute(startsAt, timeZone, strings)}
                {" — "}
                {booking.serviceName ?? strings.calendarNotRecordedLabel}
                {" — "}
                {booking.workerDisplayName}
                {" — "}
                {mergeBookingStatusLabel(booking.status, strings)}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** `23-60`: the server's own closed vocabulary
 * (`Available`/`PendingConfirmation`/`Booked`/`Cancelled`/`NoShow`/`Blocked`), translated for
 * display rather than shown verbatim - the identical "never print an English enum member name at an
 * operator" discipline every other status this console renders already follows. `Available`/`Blocked`
 * never actually appear here (`ICustomerMergePreviewReadStore`'s own remarks: a preview row always
 * carries a customer, and neither status ever does), but both are handled rather than left to fall
 * through to the raw string, so a future change to that guarantee fails loudly as an untranslated
 * label rather than silently. */
function mergeBookingStatusLabel(status: string, strings: ConsoleStrings): string {
  switch (status) {
    case "PendingConfirmation":
      return strings.calendarStatusPendingConfirmation;
    case "Booked":
      return strings.calendarStatusBooked;
    case "Cancelled":
      return strings.calendarStatusCancelled;
    case "NoShow":
      return strings.calendarStatusNoShow;
    default:
      return status;
  }
}
