import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { PhoneInput } from "../components/PhoneInput.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Skeleton } from "../components/Spinner.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import type {
  ConfiguredCalendar,
  ConfiguredService,
  ConfiguredWorker,
  ManualBookingConfirmation,
  PersonRecognitionCandidate,
  WorkerSlot,
} from "../api/calendarApi.js";
import { formatClockTime, formatDateStamp, parseInstant } from "../time/format.js";

/** `26-268`/`adr/0188`: the one permission this action checks. Byte-for-byte
 * `Ago.Calendar.Domain.Permission.BookingCreate`/`Ago.Chat.Domain.Permission.BookingCreate` (`adr/0093`
 * mirror) - seeded onto the Operator and Admin roles (`ago-chat`'s `RegisterSiteHandler`). Gated on this
 * alone, deliberately not paired with `customer:edit` - the design doc's own §2 decision: the client this
 * flow creates is the booking's own trusted side-effect (the identical shape a widget booking mints one
 * with no permission check at all), so `customer:edit` would guard no real sub-operation here. */
export const MANUAL_BOOKING_PERMISSION = "booking:create";

type WizardStep = "phone" | "client" | "service" | "worker" | "slot" | "review";

/** `26-323` (design of record `26-321`): the service and worker steps each auto-select and skip
 * themselves when they would offer exactly one option, since a "choose" step with only one choice is
 * exactly what confused the first live user (she did not realise tapping her own name was required).
 * Which of those two steps a given walk actually visits varies per booking, so `handleBack`/`advance`
 * track it as a history stack rather than a fixed `WizardStep -> WizardStep` map (the old `PREVIOUS_STEP`
 * this replaces) - a static map cannot express "back from slot goes to service, worker was skipped" and
 * "back from slot goes to client, both were skipped" at once. */
function eligibleWorkersFor(workers: ConfiguredWorker[], serviceId: string): ConfiguredWorker[] {
  return workers.filter((worker) => worker.isActive && worker.serviceIds.includes(serviceId));
}

type Recognition =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "error"; message: string }
  | { status: "found"; candidates: PersonRecognitionCandidate[] };

/** `26-268`§3.4: the "returning client" hint's own three-way Russian plural - `noShowWord`'s
 * (`calendarFormat.tsx`) identical one/few/many shape, restated here for "запись"/"booking" rather than
 * imported, since the two counted nouns are unrelated words with no shared vocabulary to factor out. */
function manualBookingRecordWord(strings: ConsoleStrings, count: number): string {
  if (count === 1) {
    return strings.calendarManualBookingRecordWordOne;
  }
  return count < 5 ? strings.calendarManualBookingRecordWordFew : strings.calendarManualBookingRecordWordMany;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ManualBookingCreateInput {
  calendarId: string;
  serviceId: string;
  workerId: string;
  startEventId: string;
  name: string;
  phone: string;
  reusePersonId: string | null;
  email: string | null;
}

export interface ManualBookingButtonProps {
  /** From `getConfiguration()` - the same tenant-wide read every other calendar screen already loads.
   * Filtered to active rows inside this component (an archived service or a deactivated/removed worker
   * is never offered here), the identical "still returned, but not offered" posture `ConfiguredService
   * .isActive`'s own remarks describe. */
  services: ConfiguredService[];
  workers: ConfiguredWorker[];
  /** Resolves which calendar a picked worker belongs to (`calendar.workerIds.includes(workerId)`) -
   * the same lookup `CalendarSetupPage`/`CalendarWorkerSlotsPage`/`CalendarAvailabilityPage` already
   * make, needed here because `createManualBooking`'s own wire body names a `calendarId`. */
  calendars: ConfiguredCalendar[];
  /** `GET /contacts/by-phone` - `26-268`§3.4's own phone-first recognition step. Injected rather than
   * imported, `RescheduleBookingButton.tsx`'s own reasoning: "the page owns the request, this owns the
   * interaction around it". */
  onSearchByPhone: (phone: string, signal: AbortSignal) => Promise<PersonRecognitionCandidate[]>;
  /** The display-merge for a recognized candidate's own name - chat's Person registry, read by id
   * (`adr/0184`). A small, local batch rather than the shared `usePersonNames` hook: this dialog never
   * shows more than a handful of candidates at once, and taking the read as an injected function keeps
   * this component free of its own access token, matching every other prop here. */
  onLookupNames: (
    personIds: string[],
    signal: AbortSignal,
  ) => Promise<{ personId: string; displayName: string | null }[]>;
  /** The same worker-day-grid read `RescheduleBookingButton`'s own `onLoadSlots` already wraps
   * (`getWorkerSlots`), parameterised by worker here since the wizard picks the worker itself rather
   * than inheriting it from an existing row. */
  onLoadSlots: (workerId: string, date: string, signal: AbortSignal) => Promise<WorkerSlot[]>;
  onCreate: (input: ManualBookingCreateInput) => Promise<ManualBookingConfirmation>;
  /** Told once the booking lands, so the page can re-read the confirmed-bookings range - the identical
   * `onRescheduled`/`reload()` shape every other write on this screen already uses. */
  onCreated: () => void;
  timeZone: string | null;
}

/**
 * `26-268`/`adr/0188`: `CalendarBookingsPage`'s second `PageHead` action - «Добавить вручную», beside
 * «Обновить». Blocks a slot for a client taken by phone before the tenant had this product, without the
 * visitor's own verify-and-confirm dance and without creating a chat conversation (`26-268`§4).
 *
 * <b>Hidden, not disabled, without `booking:create`</b> - `RescheduleBookingButton`'s own idiom, restated
 * here for a new permission rather than duplicated as a design choice.
 *
 * <b>Phone-first, because recognition has to happen before a name is even asked for.</b> The design
 * doc's own §3.4 (author decision 2026-09-28): the operator types the phone, the server answers with
 * zero, one, or several existing clients, and only the operator's own tap - «Это он», a pick-list row,
 * or «Новый клиент» - decides who this booking belongs to (`adr/0147`: a phone is a hint, never proof,
 * so this dialog never merges automatically). A recognized client skips the name/email step entirely;
 * a new one is asked for a name (required) and an email (optional - "hard to justify on a phone call").
 *
 * <b>Six steps, one dialog, modelled on `RescheduleBookingButton.tsx`.</b> That component proved the
 * shape for "pick a date, read the worker's own grid, name the chosen slot by its `eventId`, submit,
 * `reload()`" - step 5 here is exactly that read, reused verbatim through `onLoadSlots`. What is new is
 * the wizard around it: phone → client → service → worker → date/slot → review, each step gating the
 * next until its own choice is made, mirroring the live Android design pass
 * (`https://android-design.agochat.ru/manual-booking.html`) adapted to a single desktop dialog instead
 * of six screens - the same "same guided flow, only its container changes" idea that page's own remarks
 * state explicitly for the console.
 *
 * <b>Nothing this dialog does is a decision.</b> Every one of its reads (`onSearchByPhone`/`onLookupNames`/
 * `onLoadSlots`) is a courtesy - the operator's own choice at each step is what the final `onCreate` call
 * carries forward, and the server's own atomic claim (rule 8) is the only place "is this slot still
 * free" is actually decided. Losing that race surfaces as `booking.slot_unavailable`
 * (`calendarErrorMessage.ts`), the same ordinary, expected outcome reschedule already treats it as.
 */
export function ManualBookingButton({
  services,
  workers,
  calendars,
  onSearchByPhone,
  onLookupNames,
  onLoadSlots,
  onCreate,
  onCreated,
  timeZone,
}: ManualBookingButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("phone");
  // The steps actually visited on this walk, in order - `handleBack`'s own source of truth so it can
  // return to whichever step the operator last saw, even when `service` and/or `worker` were skipped.
  const [history, setHistory] = useState<WizardStep[]>(["phone"]);

  const [phone, setPhone] = useState("");
  const [recognition, setRecognition] = useState<Recognition>({ status: "idle" });
  const [candidateNames, setCandidateNames] = useState<Map<string, string | null> | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [reusePersonId, setReusePersonId] = useState<string | null>(null);
  const [reusedCandidate, setReusedCandidate] = useState<PersonRecognitionCandidate | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);

  const [date, setDate] = useState(todayIsoDate);
  const [slots, setSlots] = useState<WorkerSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Loads a candidate's own name from chat's Person registry the moment a search resolves to at least
  // one row - a display-only read, degrading to "no name" on failure rather than blocking the wizard
  // (`adr/0184`'s "never a failed booking" posture, restated for this dialog's own small batch).
  useEffect(() => {
    if (recognition.status !== "found" || recognition.candidates.length === 0) {
      return;
    }
    const controller = new AbortController();
    // `usePersonNames.ts`'s own identical suppression: a fresh batch's own "loading" reset, not a
    // synchronous data fetch - every `setState` below it runs after the `await`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandidateNames(null);
    onLookupNames(recognition.candidates.map((candidate) => candidate.personId), controller.signal)
      .then((profiles) => {
        const next = new Map<string, string | null>();
        for (const profile of profiles) {
          next.set(profile.personId, profile.displayName);
        }
        setCandidateNames(next);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setCandidateNames(new Map());
        }
      });
    return () => controller.abort();
  }, [recognition, onLookupNames]);

  // The worker's own day grid - keyed on the worker and the picked date only, deliberately not on
  // `step`, so stepping back from Review to the slot step never re-fetches and never discards the
  // already-picked `selectedEventId` (RescheduleBookingButton's own effect has no "step" to worry about
  // since it is a single-step dialog; this wizard's own back-and-forth is what makes the distinction
  // matter here).
  useEffect(() => {
    if (!open || workerId === null) {
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots(null);
    setSlotsError(null);
    setSelectedEventId(null);
    onLoadSlots(workerId, date, controller.signal)
      .then((rows) => setSlots(rows))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setSlotsError(calendarErrorMessage(reason, strings));
        }
      });
    return () => controller.abort();
  }, [open, workerId, date, onLoadSlots, strings]);

  if (!hasPermission(MANUAL_BOOKING_PERMISSION)) {
    return null;
  }

  const candidateName = (personId: string): string | null | undefined => {
    if (candidateNames === null) {
      return undefined; // still loading
    }
    return candidateNames.get(personId) ?? null;
  };

  const resetAndOpen = () => {
    setStep("phone");
    setHistory(["phone"]);
    setPhone("");
    setRecognition({ status: "idle" });
    setCandidateNames(null);
    setSelectedCandidateId(null);
    setReusePersonId(null);
    setReusedCandidate(null);
    setName("");
    setEmail("");
    setServiceId(null);
    setWorkerId(null);
    setDate(todayIsoDate());
    setSlots(null);
    setSlotsError(null);
    setSelectedEventId(null);
    setSubmitError(null);
    setOpen(true);
  };

  const search = async () => {
    setRecognition({ status: "searching" });
    try {
      const candidates = await onSearchByPhone(phone.trim(), new AbortController().signal);
      setRecognition({ status: "found", candidates });
      setSelectedCandidateId(null);
    } catch (reason) {
      setRecognition({ status: "error", message: calendarErrorMessage(reason, strings) });
    }
  };

  const changePhone = () => {
    setRecognition({ status: "idle" });
    setCandidateNames(null);
    setSelectedCandidateId(null);
  };

  const chooseReuse = (candidate: PersonRecognitionCandidate | null) => {
    setReusePersonId(candidate?.personId ?? null);
    setReusedCandidate(candidate);
    advance("client");
  };

  // A genuine forward move to a step the operator actually sees - as opposed to a same-step selection
  // (picking a service or worker button keeps `step` put until "Next", or until a skip fires). Every
  // real transition goes through this so `history` always matches what was shown, which is what makes
  // `handleBack` correct without a step-by-step map of what was skipped.
  const advance = (next: WizardStep) => {
    setStep(next);
    setHistory([...history, next]);
  };

  // The client step's "Next": skips the service step when there is exactly one active service
  // (auto-selecting it), and - having settled on a service one way or the other - also skips the worker
  // step when that service has exactly one eligible worker. The two checks compose because a tenant can
  // hit either or both (a single-master tenant with one service skips straight to the slot step).
  const advanceFromClient = () => {
    if (activeServices.length !== 1) {
      advance("service");
      return;
    }
    const soleService = activeServices[0];
    setServiceId(soleService.serviceId);
    const eligible = eligibleWorkersFor(workers, soleService.serviceId);
    if (eligible.length === 1) {
      setWorkerId(eligible[0].workerId);
      advance("slot");
    } else {
      setWorkerId(null);
      advance("worker");
    }
  };

  const activeServices = services.filter((service) => service.isActive);
  const workersForService = serviceId === null ? [] : eligibleWorkersFor(workers, serviceId);
  const availableSlots = (slots ?? []).filter((slot) => slot.status === "Available");
  const selectedSlot = selectedEventId === null ? null : (slots ?? []).find((slot) => slot.eventId === selectedEventId) ?? null;
  const selectedService = services.find((service) => service.serviceId === serviceId) ?? null;
  const selectedWorker = workers.find((worker) => worker.workerId === workerId) ?? null;

  const handleBack = () => {
    if (history.length <= 1) {
      return;
    }
    const next = history.slice(0, -1);
    setStep(next[next.length - 1]);
    setHistory(next);
  };

  const handleClose = () => {
    if (!submitting) {
      setOpen(false);
    }
  };

  const handleSubmit = async () => {
    if (workerId === null || serviceId === null || selectedEventId === null) {
      return;
    }
    const calendar = calendars.find((candidate) => candidate.workerIds.includes(workerId));
    if (calendar === undefined) {
      setSubmitError(strings.calendarNetworkError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreate({
        calendarId: calendar.calendarId,
        serviceId,
        workerId,
        startEventId: selectedEventId,
        // Ignored server-side on a reuse (`EnterManualBookingHandler`'s own remarks - the name only
        // matters for the newly-minted branch), so an empty string is harmless there.
        name: reusePersonId === null ? name.trim() : "",
        phone: phone.trim(),
        reusePersonId,
        email: email.trim() === "" ? null : email.trim(),
      });
      setOpen(false);
      onCreated();
    } catch (reason) {
      setSubmitError(calendarErrorMessage(reason, strings));
    } finally {
      setSubmitting(false);
    }
  };

  // The footer's one dynamic action - `null` when the current step's own forward move is only ever
  // taken through an inline control (the one-candidate card's «Это он»/«Новый клиент» buttons), so the
  // footer offers nothing that would duplicate or race with them.
  let primary: { label: string; disabled: boolean; onClick: () => void } | null = null;
  switch (step) {
    case "phone":
      if (recognition.status === "idle") {
        primary = { label: strings.calendarManualBookingSearchButton, disabled: phone.trim() === "", onClick: () => void search() };
      } else if (recognition.status === "searching") {
        primary = { label: strings.calendarManualBookingSearchingLabel, disabled: true, onClick: () => undefined };
      } else if (recognition.status === "error") {
        primary = { label: strings.calendarManualBookingRetryButton, disabled: false, onClick: () => void search() };
      } else if (recognition.candidates.length === 0) {
        primary = { label: strings.calendarManualBookingContinueAsNewButton, disabled: false, onClick: () => chooseReuse(null) };
      } else if (recognition.candidates.length > 1) {
        primary = {
          label: strings.calendarManualBookingNextButton,
          disabled: selectedCandidateId === null,
          onClick: () => {
            const picked = recognition.candidates.find((candidate) => candidate.personId === selectedCandidateId) ?? null;
            chooseReuse(picked);
          },
        };
      }
      // The one-candidate case has no footer primary - see this component's own doc comment.
      break;
    case "client":
      primary = {
        label: strings.calendarManualBookingNextButton,
        disabled: reusePersonId === null && name.trim() === "",
        onClick: () => advanceFromClient(),
      };
      break;
    case "service":
      primary = {
        label: strings.calendarManualBookingNextButton,
        disabled: serviceId === null,
        onClick: () => advance("worker"),
      };
      break;
    case "worker":
      primary = {
        label: strings.calendarManualBookingNextButton,
        disabled: workerId === null,
        onClick: () => advance("slot"),
      };
      break;
    case "slot":
      primary = {
        label: strings.calendarManualBookingNextButton,
        disabled: selectedEventId === null,
        onClick: () => advance("review"),
      };
      break;
    case "review":
      primary = {
        label: submitting ? strings.calendarManualBookingSubmittingLabel : strings.calendarManualBookingSubmitButton,
        disabled: submitting,
        onClick: () => void handleSubmit(),
      };
      break;
  }

  const stepName: Record<WizardStep, string> = {
    phone: strings.calendarManualBookingStepPhone,
    client: strings.calendarManualBookingStepClient,
    service: strings.calendarManualBookingStepService,
    worker: strings.calendarManualBookingStepWorker,
    slot: strings.calendarManualBookingStepSlot,
    review: strings.calendarManualBookingStepReview,
  };
  const stepIndex: Record<WizardStep, number> = { phone: 1, client: 2, service: 3, worker: 4, slot: 5, review: 6 };

  // Review step's own "Client" row: the typed name for a freshly-minted client, the display-merged
  // name (falling back to the phone while it is still loading) for a reused one.
  const reviewClientName = reusePersonId === null ? (name.trim() === "" ? phone : name.trim()) : candidateName(reusePersonId) ?? phone;

  return (
    <>
      <Button onClick={resetAndOpen}>{strings.calendarManualBookingButton}</Button>

      <Dialog
        open={open}
        title={strings.calendarManualBookingDialogTitle}
        onClose={handleClose}
        footer={
          <>
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>
              {strings.cancelButton}
            </Button>
            {history.length > 1 && (
              <Button variant="secondary" onClick={handleBack} disabled={submitting}>
                {strings.calendarManualBookingBackButton}
              </Button>
            )}
            {primary !== null && (
              <Button onClick={primary.onClick} disabled={primary.disabled || submitting}>
                {primary.label}
              </Button>
            )}
          </>
        }
      >
        <p className="ago-meta">{strings.calendarManualBookingStepLabel(stepIndex[step], 6, stepName[step])}</p>

        {step === "phone" && (
          <>
            <Field label={strings.calendarManualBookingPhoneFieldLabel} description={strings.calendarManualBookingPhoneHint}>
              {(controlProps) => (
                <PhoneInput
                  {...controlProps}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={recognition.status !== "idle" && recognition.status !== "error"}
                />
              )}
            </Field>

            {recognition.status !== "idle" && (
              <Button variant="ghost" size="sm" onClick={changePhone}>
                {strings.calendarManualBookingChangePhoneButton}
              </Button>
            )}

            {recognition.status === "error" && <Alert tone="danger">{recognition.message}</Alert>}

            {recognition.status === "found" && recognition.candidates.length === 0 && (
              <p className="ago-meta">{strings.calendarManualBookingNotFoundTitle}</p>
            )}

            {recognition.status === "found" && recognition.candidates.length === 1 && (
              <Panel quiet title={strings.calendarManualBookingFoundOneTitle}>
                <p>{candidateName(recognition.candidates[0].personId) ?? phone}</p>
                <p className="ago-meta">{phone}</p>
                <Badge tone="brand">
                  {strings.calendarManualBookingReturningClientLabel(
                    recognition.candidates[0].bookingCount,
                    manualBookingRecordWord(strings, recognition.candidates[0].bookingCount),
                  )}
                </Badge>
                <div className="ago-row">
                  <Button onClick={() => chooseReuse(recognition.candidates[0])}>{strings.calendarManualBookingReuseButton}</Button>
                  <Button variant="secondary" onClick={() => chooseReuse(null)}>
                    {strings.calendarManualBookingNewClientButton}
                  </Button>
                </div>
              </Panel>
            )}

            {recognition.status === "found" && recognition.candidates.length > 1 && (
              <Panel quiet title={strings.calendarManualBookingFoundSeveralTitle} description={strings.calendarManualBookingFoundSeveralHint}>
                <div className="ago-row" role="radiogroup" aria-label={strings.calendarManualBookingCandidatesLabel}>
                  {recognition.candidates.map((candidate) => {
                    const selected = selectedCandidateId === candidate.personId;
                    return (
                      <Button
                        key={candidate.personId}
                        size="sm"
                        variant={selected ? "primary" : "secondary"}
                        aria-pressed={selected}
                        onClick={() => setSelectedCandidateId(candidate.personId)}
                      >
                        {candidateName(candidate.personId) ?? candidate.phone} ·{" "}
                        {strings.calendarManualBookingReturningClientLabel(
                          candidate.bookingCount,
                          manualBookingRecordWord(strings, candidate.bookingCount),
                        )}
                      </Button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant={selectedCandidateId === "NEW" ? "primary" : "secondary"}
                    aria-pressed={selectedCandidateId === "NEW"}
                    onClick={() => setSelectedCandidateId("NEW")}
                  >
                    {strings.calendarManualBookingNewClientButton}
                  </Button>
                </div>
              </Panel>
            )}
          </>
        )}

        {step === "client" &&
          (reusePersonId !== null ? (
            <Panel quiet title={strings.calendarManualBookingRecognizedClientLabel}>
              <p>{candidateName(reusePersonId) ?? phone}</p>
              <p className="ago-meta">{phone}</p>
              {reusedCandidate && (
                <Badge tone="brand">
                  {strings.calendarManualBookingReturningClientLabel(
                    reusedCandidate.bookingCount,
                    manualBookingRecordWord(strings, reusedCandidate.bookingCount),
                  )}
                </Badge>
              )}
            </Panel>
          ) : (
            <>
              <Field label={strings.calendarManualBookingNameFieldLabel}>
                {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required />}
              </Field>
              <Field label={strings.calendarManualBookingEmailFieldLabel} description={strings.calendarManualBookingEmailOptionalHint}>
                {(controlProps) => <Input {...controlProps} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
            </>
          ))}

        {step === "service" && (
          <div className="ago-row" role="radiogroup" aria-label={strings.calendarManualBookingServiceFieldLabel}>
            {activeServices.map((service) => {
              const selected = serviceId === service.serviceId;
              return (
                <Button
                  key={service.serviceId}
                  size="sm"
                  variant={selected ? "primary" : "secondary"}
                  aria-pressed={selected}
                  onClick={() => {
                    setServiceId(service.serviceId);
                    const eligible = eligibleWorkersFor(workers, service.serviceId);
                    if (eligible.length === 1) {
                      // Exactly one eligible worker for this service - auto-select it and jump straight
                      // to the slot step, the same one-option skip `advanceFromClient` applies to the
                      // service step itself. The review step already names the worker, so nothing here
                      // needs new copy to explain the jump.
                      setWorkerId(eligible[0].workerId);
                      advance("slot");
                    } else {
                      setWorkerId(null);
                    }
                  }}
                >
                  {service.name} · {service.durationMinutes}
                  {strings.calendarSetupServiceMinutesSuffix}
                </Button>
              );
            })}
          </div>
        )}

        {step === "worker" &&
          (workersForService.length === 0 ? (
            <p className="ago-meta">{strings.calendarManualBookingNoWorkersForServiceLabel}</p>
          ) : (
            <div className="ago-row" role="radiogroup" aria-label={strings.calendarManualBookingWorkerFieldLabel}>
              {workersForService.map((worker) => {
                const selected = workerId === worker.workerId;
                return (
                  <Button
                    key={worker.workerId}
                    size="sm"
                    variant={selected ? "primary" : "secondary"}
                    aria-pressed={selected}
                    onClick={() => setWorkerId(worker.workerId)}
                  >
                    {worker.displayName}
                  </Button>
                );
              })}
            </div>
          ))}

        {step === "slot" && (
          <>
            <Field label={strings.calendarManualBookingDateFieldLabel}>
              {(controlProps) => (
                <Input {...controlProps} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              )}
            </Field>

            {slotsError !== null && <Alert tone="danger">{slotsError}</Alert>}

            {slots === null && slotsError === null ? (
              <Skeleton lines={3} label={strings.calendarLoading} />
            ) : availableSlots.length === 0 && slotsError === null ? (
              <p className="ago-meta">{strings.calendarManualBookingNoSlotsLabel}</p>
            ) : (
              <div className="ago-row" role="radiogroup" aria-label={strings.calendarManualBookingSlotsLabel}>
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
          </>
        )}

        {step === "review" && (
          <dl className="ago-stack">
            <dt>{strings.calendarManualBookingClientTypeLabel}</dt>
            <dd>
              {reviewClientName}
              {" — "}
              {reusePersonId === null
                ? strings.calendarManualBookingNewClientTypeValue
                : strings.calendarManualBookingReturningClientTypeValue}
            </dd>

            <dt>{strings.calendarManualBookingReviewServiceLabel}</dt>
            <dd>
              {selectedService?.name} · {selectedService?.durationMinutes}
              {strings.calendarSetupServiceMinutesSuffix}
            </dd>

            <dt>{strings.calendarManualBookingReviewWorkerLabel}</dt>
            <dd>{selectedWorker?.displayName}</dd>

            <dt>{strings.calendarManualBookingSlotsLabel}</dt>
            <dd>
              {selectedSlot &&
                (() => {
                  const startsAt = parseInstant(selectedSlot.startsAt);
                  const endsAt = parseInstant(selectedSlot.endsAt);
                  return startsAt && endsAt
                    ? `${formatDateStamp(startsAt, timeZone, strings)} ${formatClockTime(startsAt, timeZone, strings)}–${formatClockTime(endsAt, timeZone, strings)}`
                    : null;
                })()}
            </dd>

            <dt>{strings.calendarManualBookingReviewPhoneLabel}</dt>
            <dd>{phone}</dd>

            <dt>{strings.calendarManualBookingReviewEmailLabel}</dt>
            <dd>{email.trim() === "" ? strings.calendarManualBookingReviewEmailNotProvidedLabel : email}</dd>
          </dl>
        )}

        {step === "review" && <p className="ago-meta">{strings.calendarManualBookingReviewNote}</p>}
        {step === "review" && submitError !== null && <Alert tone="danger">{submitError}</Alert>}
      </Dialog>
    </>
  );
}
