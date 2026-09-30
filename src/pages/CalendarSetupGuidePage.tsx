import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  addWorkingHoursRule,
  createCalendar,
  createService,
  createWorker,
  getBookingReadiness,
  getConfiguration,
  getWorker,
  previewRecutSchedule,
  recutSchedule,
  updateCalendar,
  updateWorker,
  type CalendarReadiness,
  type ConfiguredCalendar,
  type ConfiguredWorker,
  type TenantConfiguration,
} from "../api/calendarApi.js";
import { fetchModules, setModuleTriggerWords } from "../api/modulesApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { timeZoneOptions, weekdayNames } from "../calendar/calendarFormat.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { ROUTE_FOR } from "../calendar/bookingPreconditionRoutes.js";
import { WorkerCard, type WorkerCardFields } from "../calendar/WorkerCard.js";
import { WorkerScheduleSection } from "../calendar/WorkerScheduleSection.js";
import { deriveWizardStep, type WizardStepId } from "../calendar/setupWizardStep.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

const BOOKINGS_MODULE_KEY = "calendar";
const DEFAULT_TRIGGER_WORD = "/записаться";

/**
 * `26-329`/`26-318`: `/calendar/setup/guide` - the guided setup wizard's first implementation slice.
 * Auto-launched from `BookingsModulePage` the moment a tenant enables the calendar module; reachable
 * again by URL any time afterward, since it derives its own step fresh on every mount.
 *
 * <b>The one rule this whole file exists to keep: no second source of truth.</b> There is no
 * "onboarding progress" row, flag or local-storage key anywhere in this component - every render calls
 * {@link deriveWizardStep} on the same `GET /booking-readiness` answer `BookingReadiness.tsx` already
 * renders on `/calendar/setup` and `/calendar/masters`, plus the one console-only fact readiness does
 * not carry (whether a booking trigger word is set, decision 6). Leaving this screen and clicking a
 * stale bookmark back to it lands on whatever the server says is still missing - never a step this
 * component itself remembered.
 *
 * <b>Every write below already exists.</b> `createCalendar`/`createWorker`/`createService`/
 * `updateWorker`/`addWorkingHoursRule`/`saveWorkerSchedule` (via `WorkerScheduleSection`, reused
 * unchanged plus one optional `onSaved` hook)/`setModuleTriggerWords`/`updateCalendar` are the exact
 * calls `CalendarSetupPage`/`CalendarWorkersPage`/`CalendarServicesPage`/`BookingsModulePage` already
 * make - this screen only re-presents them as one step at a time, in dependency order, instead of six
 * screens a first-run tenant has to discover on their own.
 */
export function CalendarSetupGuidePage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();

  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [readiness, setReadiness] = useState<CalendarReadiness[] | null>(null);
  /** `null` while the module read has not resolved yet - `[]` is a real, loaded answer ("no trigger
   * word set"), which {@link deriveWizardStep} reads as `hasBookingTrigger: false`. */
  const [triggerWords, setTriggerWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [materializePollCount, setMaterializePollCount] = useState(0);
  const [materializeFallbackNote, setMaterializeFallbackNote] = useState<string | null>(null);
  const [showAnotherMasterForm, setShowAnotherMasterForm] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken || !siteId) {
        return;
      }

      try {
        const [loadedConfiguration, loadedReadiness] = await Promise.all([
          getConfiguration(accessToken, signal),
          getBookingReadiness(accessToken, signal),
        ]);
        setConfiguration(loadedConfiguration);
        setReadiness(loadedReadiness);
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }

      try {
        const modules = await fetchModules(accessToken, siteId);
        const row = modules.modules.find((candidate) => candidate.moduleKey === BOOKINGS_MODULE_KEY) ?? null;
        setTriggerWords(row?.triggerWords ?? []);
      } catch (reason) {
        // `26-329` decision 6: a failed read here must never be mistaken for "trigger word set" - the
        // safe default is the closed gate, same as "no trigger word", never a guess in the open
        // direction. The critical `configuration`/`readiness` failure above already surfaced `error`;
        // this one is silent, the same "supplementary read degrades quietly" precedent
        // `CalendarWorkersPage.reload`'s own remarks state for its readiness fetch.
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setTriggerWords((current) => current ?? []);
        }
      }
    },
    [user?.access_token, siteId, strings],
  );

  useEffect(() => {
    if (!hasPermission("calendar:configure") || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    // `23-100`: suppressed here rather than rewritten - the identical justification every other
    // calendar screen's own mount-time `reload()` carries (`CalendarServicesPage.tsx`'s own remarks):
    // every `setState` this reaches runs after an `await`, never synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <CalendarAccessRefusal title={strings.calendarGuideTitle} forbiddenMessage={strings.calendarSetupForbidden} strings={strings} />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.calendarGuideTitle} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined || siteId === null) {
    // `RequireAuth`/`PermissionsProvider` guarantee both by the time this renders - the identical
    // "reaching here is a wiring bug" reasoning every other calendar screen states for its own
    // equivalent check.
    return null;
  }

  const loaded = configuration !== null && readiness !== null && triggerWords !== null;
  if (!loaded) {
    return (
      <>
        <PageHead title={strings.calendarGuideTitle} description={strings.calendarGuideIntro} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={5} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  const hasBookingTrigger = triggerWords.length > 0;
  const step = deriveWizardStep(readiness, hasBookingTrigger);
  const calendarReadiness = readiness[0];
  const activeCalendar = configuration.calendars.find((candidate) => candidate.calendarId === calendarReadiness.calendarId);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
      setShowAnotherMasterForm(false);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  const mastersOnCalendar = (calendar: ConfiguredCalendar) =>
    configuration.workers.filter((worker) => calendar.workerIds.includes(worker.workerId));

  const targetWorker = activeCalendar === undefined ? undefined : pickTargetWorker(configuration, activeCalendar);

  return (
    <>
      <PageHead title={strings.calendarGuideTitle} description={strings.calendarGuideIntro} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {step !== undefined && step !== "create-calendar" && step !== "add-master" && activeCalendar !== undefined && (
        <MastersStrip
          calendar={activeCalendar}
          workers={mastersOnCalendar(activeCalendar)}
          services={configuration.services}
          quota={configuration.workerQuota}
          busy={busy}
          strings={strings}
          showForm={showAnotherMasterForm}
          onToggleForm={setShowAnotherMasterForm}
          onCreate={(fields) =>
            void run(() =>
              createWorker(accessToken, {
                lastName: fields.lastName,
                firstName: fields.firstName,
                middleName: fields.middleName,
                displayName: fields.displayName,
                calendarId: activeCalendar.calendarId,
                serviceIds: fields.serviceIds,
              }),
            )
          }
        />
      )}

      {step === "create-calendar" && (
        <CreateCalendarStep
          tenantName={configuration.tenantName}
          disabled={busy}
          strings={strings}
          onSubmit={(body) => void run(() => createCalendar(accessToken, body))}
        />
      )}

      {step === "add-master" && activeCalendar !== undefined && (
        <AddMasterStep
          calendar={activeCalendar}
          services={configuration.services}
          quota={configuration.workerQuota}
          activeCount={mastersOnCalendar(activeCalendar).filter((w) => w.isActive).length}
          disabled={busy}
          strings={strings}
          onCreate={(fields) =>
            void run(() =>
              createWorker(accessToken, {
                lastName: fields.lastName,
                firstName: fields.firstName,
                middleName: fields.middleName,
                displayName: fields.displayName,
                calendarId: fields.calendarId,
                serviceIds: fields.serviceIds,
              }),
            )
          }
        />
      )}

      {step === "add-service" && targetWorker !== undefined && activeCalendar !== undefined && (
        <AddServiceStep
          worker={targetWorker}
          otherActiveWorkerCount={mastersOnCalendar(activeCalendar).filter((w) => w.isActive && w.workerId !== targetWorker.workerId).length}
          disabled={busy}
          strings={strings}
          onCreate={(body) =>
            void run(async () => {
              const created = await createService(accessToken, body);
              const others = mastersOnCalendar(activeCalendar).filter((w) => w.isActive);
              if (others.length === 1) {
                const current = await getWorker(accessToken, targetWorker.workerId);
                await updateWorker(accessToken, targetWorker.workerId, {
                  lastName: current.lastName,
                  firstName: current.firstName,
                  middleName: current.middleName,
                  displayName: current.displayNameIsCustom ? current.displayName : null,
                  isActive: current.isActive,
                  serviceIds: [...current.serviceIds, created.serviceId],
                });
              }
            })
          }
        />
      )}

      {step === "working-hours" && targetWorker !== undefined && activeCalendar !== undefined && (
        <WorkingHoursStep
          disabled={busy}
          strings={strings}
          onSubmit={(days, startsAt, endsAt) =>
            void run(async () => {
              for (const dayOfWeek of days) {
                await addWorkingHoursRule(accessToken, {
                  calendarId: activeCalendar.calendarId,
                  workerId: targetWorker.workerId,
                  dayOfWeek,
                  startsAt,
                  endsAt,
                });
              }
            })
          }
        />
      )}

      {step === "confirm-schedule" && targetWorker !== undefined && (
        <Panel title={strings.calendarReadinessScheduleSavedLabel} description={strings.calendarGuideScheduleIntro}>
          <StepIndex step="confirm-schedule" strings={strings} />
          <WorkerScheduleSection workerId={targetWorker.workerId} onSaved={() => void reload()} />
        </Panel>
      )}

      {step === "materializing" && targetWorker !== undefined && (
        <MaterializingStep
          workerId={targetWorker.workerId}
          busy={busy}
          pollCount={materializePollCount}
          fallbackNote={materializeFallbackNote}
          strings={strings}
          onPoll={() => {
            setMaterializePollCount((count) => count + 1);
            void reload();
          }}
          onFallback={() =>
            void run(async () => {
              const from = new Date().toISOString().slice(0, 10);
              const preview = await previewRecutSchedule(accessToken, targetWorker.workerId, from);
              await recutSchedule(accessToken, targetWorker.workerId, {
                from,
                fingerprint: preview.fingerprint,
                decisions: preview.days.flatMap((day) =>
                  day.bookings.filter((booking) => booking.canDecide).map((booking) => ({ bookingId: booking.bookingId, decision: "Keep" as const })),
                ),
              });
              setMaterializeFallbackNote(strings.calendarGuideMaterializingFallbackDone);
            })
          }
        />
      )}

      {step === "booking-trigger" && (
        <BookingTriggerStep
          initialWord={triggerWords[0] ?? DEFAULT_TRIGGER_WORD}
          disabled={busy}
          strings={strings}
          onSave={(word) =>
            void run(() => setModuleTriggerWords(accessToken, siteId, BOOKINGS_MODULE_KEY, [word]).then(() => undefined))
          }
        />
      )}

      {step === "publish" && activeCalendar !== undefined && (
        <PublishStep
          calendar={activeCalendar}
          disabled={busy}
          strings={strings}
          onPublish={() =>
            void run(() => updateCalendar(accessToken, activeCalendar.calendarId, { name: activeCalendar.name, publish: true }))
          }
        />
      )}

      {step === "done" && <DoneStep triggerWord={triggerWords[0] ?? DEFAULT_TRIGGER_WORD} strings={strings} />}
    </>
  );
}

/**
 * `26-329`: which worker the service/hours/schedule steps act on. The funnel every one of those three
 * preconditions is scoped to (`GetBookingReadinessHandler`'s own remarks: "among `HasWorker`'s
 * survivors, at least one who...") means progress only counts when the *same* worker clears every
 * stage - so this prefers whichever active worker on the calendar has already cleared the most stages
 * (a service, then working hours), falling back to the most recently added one when nobody has started
 * yet. Never a second API call: every fact this reads (`serviceIds`, the calendar's own
 * `workingHours` rows) is already on `TenantConfiguration`.
 */
function pickTargetWorker(configuration: TenantConfiguration, calendar: ConfiguredCalendar): ConfiguredWorker | undefined {
  const candidates = configuration.workers.filter((worker) => worker.isActive && calendar.workerIds.includes(worker.workerId));
  if (candidates.length === 0) {
    return undefined;
  }

  const withService = candidates.filter((worker) => worker.serviceIds.length > 0);
  const pool = withService.length > 0 ? withService : candidates;
  const withHours = pool.filter((worker) => calendar.workingHours.some((rule) => rule.workerId === worker.workerId));
  const finalPool = withHours.length > 0 ? withHours : pool;
  return finalPool[finalPool.length - 1];
}

function StepIndex({ step, strings }: { step: WizardStepId; strings: ConsoleStrings }) {
  const order: WizardStepId[] = [
    "create-calendar",
    "add-master",
    "add-service",
    "working-hours",
    "confirm-schedule",
    "materializing",
    "booking-trigger",
    "publish",
    "done",
  ];
  const index = order.indexOf(step) + 1;
  return (
    <p className="ago-meta">
      {strings.calendarGuideStepIndexPrefix}
      {index}
      {strings.calendarGuideStepIndexOfWord}
      {order.length}
    </p>
  );
}

/** A secondary way out of the wizard, onto the identical classic screen `BookingReadiness.tsx` already
 * points an unmet precondition at - the same {@link ROUTE_FOR} map, so the two can never disagree. */
function ClassicScreenLink({ to, strings }: { to: string; strings: ConsoleStrings }) {
  return (
    <p className="ago-meta">
      <Link to={to}>{strings.calendarReadinessFixItLink}</Link>
    </p>
  );
}

function CreateCalendarStep({
  tenantName,
  disabled,
  strings,
  onSubmit,
}: {
  tenantName: string;
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: { name: string; timeZone: string; publish: boolean }) => void;
}) {
  const [name, setName] = useState(tenantName);
  const [timeZone, setTimeZone] = useState("Europe/Moscow");

  return (
    <Panel title={strings.calendarGuideCreateCalendarTitle} description={strings.calendarGuideCreateCalendarIntro}>
      <StepIndex step="create-calendar" strings={strings} />
      <form
        className="ago-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit({ name, timeZone, publish: false });
        }}
      >
        <Field label={strings.calendarSetupCalendarNameLabel}>
          {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />}
        </Field>
        <Field label={strings.calendarSetupCalendarZoneLabel}>
          {(controlProps) => (
            <Select {...controlProps} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required disabled={disabled}>
              {timeZoneOptions(strings, timeZone).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={disabled}>
            {strings.calendarSetupAddCalendarButton}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** `26-329` decision 3's own "finish one master, or add several now" affordance - shown persistently
 * from the add-service step onward (there is at least one master by then, or this step would still be
 * "add-master"), never gated to only the master step itself. */
function MastersStrip({
  calendar,
  workers,
  services,
  quota,
  busy,
  strings,
  showForm,
  onToggleForm,
  onCreate,
}: {
  calendar: ConfiguredCalendar;
  workers: ConfiguredWorker[];
  services: TenantConfiguration["services"];
  quota: number;
  busy: boolean;
  strings: ConsoleStrings;
  showForm: boolean;
  onToggleForm: (show: boolean) => void;
  onCreate: (fields: WorkerCardFields) => void;
}) {
  const activeCount = workers.filter((worker) => worker.isActive).length;

  return (
    <Panel quiet>
      <p className="ago-meta">
        {strings.calendarWorkersQuotaPrefix}
        {activeCount}
        {strings.calendarWorkersQuotaOfWord}
        {quota}
      </p>
      {showForm ? (
        <WorkerCard
          mode="create"
          calendars={[calendar]}
          services={services}
          busy={busy}
          onSubmit={onCreate}
          onCancel={() => onToggleForm(false)}
        />
      ) : (
        activeCount < quota && (
          <div className="ago-row">
            <Button size="sm" disabled={busy} onClick={() => onToggleForm(true)}>
              {strings.calendarAddWorkerButton}
            </Button>
          </div>
        )
      )}
    </Panel>
  );
}

function AddMasterStep({
  calendar,
  services,
  quota,
  activeCount,
  disabled,
  strings,
  onCreate,
}: {
  calendar: ConfiguredCalendar;
  services: TenantConfiguration["services"];
  quota: number;
  activeCount: number;
  disabled: boolean;
  strings: ConsoleStrings;
  onCreate: (fields: WorkerCardFields) => void;
}) {
  return (
    <Panel title={strings.calendarReadinessWorkerOnCalendarLabel} description={strings.calendarGuideAddMasterIntro}>
      <StepIndex step="add-master" strings={strings} />
      <p className="ago-meta">
        {strings.calendarWorkersQuotaPrefix}
        {activeCount}
        {strings.calendarWorkersQuotaOfWord}
        {quota}
      </p>
      <WorkerCard mode="create" calendars={[calendar]} services={services} busy={disabled} onSubmit={onCreate} onCancel={() => undefined} />
      <ClassicScreenLink to={ROUTE_FOR.WorkerOnCalendar} strings={strings} />
    </Panel>
  );
}

function AddServiceStep({
  worker,
  otherActiveWorkerCount,
  disabled,
  strings,
  onCreate,
}: {
  worker: ConfiguredWorker;
  otherActiveWorkerCount: number;
  disabled: boolean;
  strings: ConsoleStrings;
  onCreate: (body: { name: string; durationMinutes: number }) => void;
}) {
  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);

  return (
    <Panel title={strings.calendarReadinessServiceOfferedLabel} description={strings.calendarGuideAddServiceIntro}>
      <StepIndex step="add-service" strings={strings} />
      {otherActiveWorkerCount === 0 ? (
        <p className="ago-field__description">
          {strings.calendarGuideAddServiceAutoAssignPrefix}
          <strong>{worker.displayName}</strong>
          {strings.calendarGuideAddServiceAutoAssignSuffix}
        </p>
      ) : (
        <Alert tone="info">{strings.calendarGuideAddServiceManualAssignNote}</Alert>
      )}
      <form
        className="ago-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onCreate({ name, durationMinutes });
        }}
      >
        <Field label={strings.calendarSetupServiceNameLabel}>
          {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />}
        </Field>
        <Field label={strings.calendarSetupServiceDurationLabel}>
          {(controlProps) => (
            <Input {...controlProps} type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} disabled={disabled} />
          )}
        </Field>
        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={disabled}>
            {strings.calendarSetupAddServiceButton}
          </Button>
        </div>
      </form>
      <ClassicScreenLink to={ROUTE_FOR.ServiceOffered} strings={strings} />
    </Panel>
  );
}

/** `26-329`: the wizard's own "one master, one day range" shape - Mon-Fri pre-checked, one start/end
 * pair, one `addWorkingHoursRule` call per checked day (default Weekly, per the item's own scope). The
 * classic screen's `WorkingHoursForm` (`CalendarSetupPage.tsx`) adds one day at a time and stays the
 * tool for a tenant who wants different hours on different days; this step exists for the common
 * first-run case of "the same hours, most days". */
function WorkingHoursStep({
  disabled,
  strings,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (days: number[], startsAt: string, endsAt: string) => void;
}) {
  const days = weekdayNames(strings);
  const [selected, setSelected] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("18:00");

  return (
    <Panel title={strings.calendarReadinessWorkingHoursConfiguredLabel} description={strings.calendarGuideWorkingHoursIntro}>
      <StepIndex step="working-hours" strings={strings} />
      <form
        className="ago-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit([...selected].sort(), startsAt, endsAt);
        }}
      >
        <fieldset className="ago-stack">
          <legend>{strings.calendarGuideWorkingHoursDaysLegend}</legend>
          {days.map((day, index) => (
            <label className="ago-row" key={day}>
              <input
                type="checkbox"
                checked={selected.includes(index)}
                disabled={disabled}
                onChange={(e) =>
                  setSelected((current) => (e.target.checked ? [...current, index] : current.filter((value) => value !== index)))
                }
              />
              <span>{day}</span>
            </label>
          ))}
        </fieldset>
        <Field label={strings.calendarOpensFieldLabel}>
          {(controlProps) => <Input {...controlProps} type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={disabled} />}
        </Field>
        <Field label={strings.calendarClosesFieldLabel}>
          {(controlProps) => <Input {...controlProps} type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={disabled} />}
        </Field>
        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={disabled || selected.length === 0}>
            {strings.calendarSetupAddWorkingHoursButton}
          </Button>
        </div>
      </form>
      <ClassicScreenLink to={ROUTE_FOR.WorkingHoursConfigured} strings={strings} />
    </Panel>
  );
}

function MaterializingStep({
  workerId,
  busy,
  pollCount,
  fallbackNote,
  strings,
  onPoll,
  onFallback,
}: {
  workerId: string;
  busy: boolean;
  pollCount: number;
  fallbackNote: string | null;
  strings: ConsoleStrings;
  onPoll: () => void;
  onFallback: () => void;
}) {
  const MAX_AUTO_POLLS = 4;

  useEffect(() => {
    if (pollCount >= MAX_AUTO_POLLS) {
      return;
    }
    const timer = setTimeout(onPoll, 2500);
    return () => clearTimeout(timer);
    // `onPoll` is a fresh closure every render (it captures `reload`); only `pollCount` should restart
    // the timer, the same "re-run when the counter moves, not when an unrelated render happens" shape
    // every polling effect in this codebase needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollCount]);

  return (
    <Panel title={strings.calendarReadinessSlotsMaterializedLabel} description={strings.calendarGuideMaterializingIntro}>
      <StepIndex step="materializing" strings={strings} />
      <Spinner label={strings.calendarGuideMaterializingIntro} />
      <div className="ago-row">
        <Button disabled={busy} onClick={onPoll}>
          {strings.calendarGuideMaterializingCheckAgainButton}
        </Button>
      </div>
      {pollCount >= MAX_AUTO_POLLS && fallbackNote === null && (
        <>
          <Alert tone="info">{strings.calendarGuideMaterializingFallbackIntro}</Alert>
          <div className="ago-row">
            <Button variant="primary" disabled={busy} onClick={onFallback}>
              {strings.calendarGuideMaterializingFallbackButton}
            </Button>
          </div>
        </>
      )}
      {fallbackNote !== null && <Alert tone="success">{fallbackNote}</Alert>}
      <ClassicScreenLink to={`/calendar/masters/${encodeURIComponent(workerId)}/slots`} strings={strings} />
    </Panel>
  );
}

function BookingTriggerStep({
  initialWord,
  disabled,
  strings,
  onSave,
}: {
  initialWord: string;
  disabled: boolean;
  strings: ConsoleStrings;
  onSave: (word: string) => void;
}) {
  const [word, setWord] = useState(initialWord);

  return (
    <Panel title={strings.calendarGuideBookingTriggerTitle} description={strings.calendarGuideBookingTriggerIntro}>
      <StepIndex step="booking-trigger" strings={strings} />
      <form
        className="ago-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSave(word.trim() === "" ? DEFAULT_TRIGGER_WORD : word.trim());
        }}
      >
        <Field label={strings.bookingsModuleTriggerWordsLabel} description={strings.bookingsModuleTriggerWordsDescription}>
          {(controlProps) => <Input {...controlProps} value={word} onChange={(e) => setWord(e.target.value)} disabled={disabled} />}
        </Field>
        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={disabled}>
            {strings.bookingsModuleTriggerWordsSaveLabel}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function PublishStep({
  calendar,
  disabled,
  strings,
  onPublish,
}: {
  calendar: ConfiguredCalendar;
  disabled: boolean;
  strings: ConsoleStrings;
  onPublish: () => void;
}) {
  return (
    <Panel title={strings.calendarReadinessCalendarPublishedLabel} description={strings.calendarGuidePublishIntro}>
      <StepIndex step="publish" strings={strings} />
      <p>
        <strong>{calendar.name}</strong> · {calendar.timeZone}
      </p>
      <div className="ago-row">
        <Button variant="primary" disabled={disabled} onClick={onPublish}>
          {strings.calendarGuidePublishButton}
        </Button>
      </div>
    </Panel>
  );
}

function DoneStep({ triggerWord, strings }: { triggerWord: string; strings: ConsoleStrings }) {
  return (
    <Panel title={strings.calendarGuideDoneTitle}>
      <p>
        {strings.calendarGuideDoneMessagePrefix}
        <strong>{triggerWord}</strong>
        {strings.calendarGuideDoneMessageSuffix}
      </p>
      <p>
        <Link to="/channels/install">{strings.navInstallWidget}</Link>
      </p>
    </Panel>
  );
}
