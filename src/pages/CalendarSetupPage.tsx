import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  addWorkingHoursRule,
  createCalendar,
  deleteWorkingHoursRule,
  getBookingReadiness,
  getConfiguration,
  setAllowedOrigins,
  updateCalendar,
  updateWorkingHoursRule,
  type CalendarReadiness,
  type ConfiguredCalendar,
  type ConfiguredWorker,
  type TenantConfiguration,
  type WorkingHoursReconciliation,
  type WorkingHoursRule,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { timeZoneOptions, weekdayNames } from "../calendar/calendarFormat.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { BookingReadiness } from "../calendar/BookingReadiness.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `22-06`/`adr/0093`: `/calendar/setup` - tenant setup (calendars, services, working hours, the
 * embed's own allowed origins), moved from `ago-calendar-console`'s own `ConfigurationPage.tsx` and
 * rewritten against this console's closed eleven-component set - see `calendar/WorkersTable.tsx`'s
 * own doc comment for why every calendar screen is a rewrite rather than a port.
 *
 * <b>One screen, three short forms, and a re-read after every write.</b> Unchanged from the source:
 * no optimistic update, no client-side cache - the authoritative answer is always the next `GET`.
 *
 * <b>`20-13`: workers stay on their own screen</b> (`/calendar/masters`) - this page's own working-
 * hours form still reads `configuration.workers` to name whose hours are whose, unchanged.
 *
 * <b>`23-31`: the services dictionary moved out, to `/calendar/services`.</b> This screen now owns
 * exactly the embed/calendars/working-hours forms - see `CalendarServicesPage`'s own doc comment for
 * the split's reasoning. `configuration.services` is still read by nothing here; the `<Panel>` that
 * once rendered it is gone, not merely hidden.
 *
 * <b>`25-53`: the calendars card is two blocks, not one.</b> The plain `<ul>` of existing calendars
 * sat directly above the create form in one `<Panel>` - the same one-blended-card shape the item's
 * own audit found here too, alongside its named example (`CalendarServicesPage`). Split into a
 * "current calendars" table with an Edit action (`updateCalendar` already exists) and a separate
 * "add calendar" card below, unchanged in substance. No delete action - `calendarApi.ts` exports no
 * `deleteCalendar` - a real gap named here rather than built around. The origins form below is left
 * alone: it replaces one whole-list string field in a single `PUT`, not individual objects with their
 * own id, so it is not an instance of this item's pattern.
 *
 * <b>`26-97`: the working-hours list is now a table with an actions column, not a read-only `<ul>`
 * inside the calendars table.</b> Until that item `ago-calendar` had exactly one working-hours verb
 * (`POST /working-hours`), so a mistyped 09:00-for-19:00 was permanent and deleting the whole worker
 * was the only remedy anywhere in the product. `PUT`/`DELETE /working-hours/{ruleId}` now exist, and
 * this screen is where they are reached. Both answer with a `reconciliation` block this page renders
 * as a persistent notice: a correction never touches days the schedule has already cut (the
 * materialiser is forward-only and non-destructive), so the days still carrying the old hours, the
 * live bookings on them, and the date to re-cut from are stated rather than left for the operator to
 * discover three weeks later. Re-cutting itself stays where it already is - `20-16`'s own screen at
 * `/calendar/masters/:workerId/recut`.
 */
export function CalendarSetupPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [readiness, setReadiness] = useState<CalendarReadiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<ConfiguredCalendar | null>(null);
  // `26-97`: the rule being corrected, the rule whose removal is being confirmed, and the answer the
  // last correction came back with. The notice is held in its own state rather than derived from
  // `configuration`, because it describes what the *write* could not reach - a fact the next `GET`
  // does not carry and never will.
  const [editingRule, setEditingRule] = useState<WorkingHoursRuleRow | null>(null);
  const [confirmingRuleDelete, setConfirmingRuleDelete] = useState<WorkingHoursRuleRow | null>(null);
  const [reconciliation, setReconciliation] = useState<WorkingHoursNotice | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      const critical = getConfiguration(accessToken, signal)
        .then((loadedConfiguration) => {
          setConfiguration(loadedConfiguration);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setError(calendarErrorMessage(reason, strings));
          }
        });

      // `23-23`: readiness is supplementary, not critical - see `CalendarWorkersPage.reload`'s own
      // remarks on why this is caught independently rather than joined into the `Promise.all` above.
      const readinessLoad = getBookingReadiness(accessToken, signal)
        .then(setReadiness)
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setReadiness(null);
          }
        });

      await Promise.all([critical, readinessLoad]);
    },
    [user?.access_token, strings],
  );

  useEffect(() => {
    if (!hasPermission("calendar:configure") || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    // `23-21`: the shared refusal - see `calendarAccess.tsx`'s own doc comment.
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarSetup}
        forbiddenMessage={strings.calendarSetupForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarSetup} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    // `RequireAuth` guarantees a signed-in session by the time this renders - same
    // "reaching here is a wiring bug" reasoning `FaqModulePage`/`WidgetConfigPage` state for their
    // own equivalent check. Narrows `accessToken` to `string` for every closure built below, so the
    // three sub-forms' own `onSubmit` handlers need no repeated null check or assertion.
    return null;
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
      setEditingCalendar(null);
      setEditingRule(null);
      setConfirmingRuleDelete(null);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  /**
   * `26-97`: `run`, plus the one thing a working-hours write has that no other write on this screen
   * does - an answer worth keeping. The server says which already-cut days the correction did not
   * reach; dropping that on the floor is exactly the silence this item exists to remove, and there is
   * nothing in the next `GET` that would let the page reconstruct it.
   */
  const runWorkingHoursChange = async (
    worker: ConfiguredWorker | undefined,
    action: () => Promise<{ reconciliation: WorkingHoursReconciliation }>,
  ) => {
    setReconciliation(null);
    await run(async () => {
      const change = await action();
      if (change.reconciliation.recutFrom !== null) {
        setReconciliation({ ...change.reconciliation, workerId: worker?.workerId ?? null });
      }
      return change;
    });
  };

  if (configuration === null) {
    return (
      <>
        <PageHead title={strings.navCalendarSetup} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={5} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  const days = weekdayNames(strings);

  return (
    <>
      <PageHead title={strings.navCalendarSetup} description={configuration.tenantName} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      <BookingReadiness readiness={readiness} />

      <Panel title={strings.calendarSetupOriginsTitle} description={strings.calendarSetupOriginsDescription}>
        <p className="ago-field__description">{strings.calendarSetupBookingAutomaticNote}</p>
        <OriginsForm
          origins={configuration.allowedOrigins}
          disabled={busy}
          strings={strings}
          onSubmit={(origins) => void run(() => setAllowedOrigins(accessToken, origins))}
        />
      </Panel>

      <Panel title={strings.calendarSetupCalendarsTitle}>
        <CalendarsTable
          calendars={configuration.calendars}
          strings={strings}
          onEdit={(calendar) => setEditingCalendar(calendar)}
          editDisabled={busy}
        />
      </Panel>

      {editingCalendar !== null && (
        <Panel title={strings.calendarEditCalendarTitle}>
          <CalendarForm
            disabled={busy}
            strings={strings}
            initial={editingCalendar}
            submitLabel={strings.siteConfigSaveButton}
            onSubmit={(body) => void run(() => updateCalendar(accessToken, editingCalendar.calendarId, body))}
          />
          <div className="ago-row">
            <Button disabled={busy} onClick={() => setEditingCalendar(null)}>
              {strings.cancelButton}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title={strings.calendarNewCalendarTitle}>
        <CalendarForm disabled={busy} strings={strings} onSubmit={(body) => void run(() => createCalendar(accessToken, body))} />
      </Panel>

      <Panel title={strings.calendarSetupWorkingHoursTitle}>
        {reconciliation !== null && <RecutNotice notice={reconciliation} strings={strings} />}
        <WorkingHoursTable
          rows={workingHoursRows(configuration)}
          days={days}
          strings={strings}
          actionsDisabled={busy}
          onEdit={setEditingRule}
          onDelete={setConfirmingRuleDelete}
        />
      </Panel>

      {editingRule !== null && (
        <Panel title={strings.calendarEditWorkingHoursTitle}>
          <p className="ago-meta">
            {editingRule.workerName} · {editingRule.calendarName}
          </p>
          <WorkingHoursFieldsForm
            disabled={busy}
            strings={strings}
            days={days}
            initial={editingRule.rule}
            submitLabel={strings.siteConfigSaveButton}
            onSubmit={(body) =>
              void runWorkingHoursChange(editingRule.worker, () =>
                updateWorkingHoursRule(accessToken, editingRule.rule.ruleId, body),
              )
            }
          />
          <div className="ago-row">
            <Button disabled={busy} onClick={() => setEditingRule(null)}>
              {strings.cancelButton}
            </Button>
          </div>
        </Panel>
      )}

      {confirmingRuleDelete !== null && (
        <Panel>
          <p>
            {strings.calendarWorkingHoursDeleteConfirmPrefix}
            <strong>
              {confirmingRuleDelete.workerName} · {days[confirmingRuleDelete.rule.dayOfWeek]}{" "}
              {confirmingRuleDelete.rule.startsAt}–{confirmingRuleDelete.rule.endsAt}
            </strong>
            {strings.calendarWorkingHoursDeleteConfirmSuffix}
          </p>
          <div className="ago-row">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void runWorkingHoursChange(confirmingRuleDelete.worker, () =>
                  deleteWorkingHoursRule(accessToken, confirmingRuleDelete.rule.ruleId),
                )
              }
            >
              {strings.calendarDeleteButton}
            </Button>
            <Button disabled={busy} onClick={() => setConfirmingRuleDelete(null)}>
              {strings.cancelButton}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title={strings.calendarNewWorkingHoursTitle} description={strings.calendarSetupWorkingHoursDescription}>
        <WorkingHoursForm
          configuration={configuration}
          disabled={busy}
          strings={strings}
          onSubmit={(body) => void run(() => addWorkingHoursRule(accessToken, body))}
        />
      </Panel>
    </>
  );
}

/** `26-97`: one row of the working-hours table - the rule itself plus the two names only the whole
 * configuration can resolve, flattened once here rather than looked up per cell. */
interface WorkingHoursRuleRow {
  rule: WorkingHoursRule;
  calendarName: string;
  workerName: string;
  /** `undefined` when the rule names a worker the configuration no longer lists - a real state, and
   * the one case where the re-cut notice has no worker to link to. */
  worker: ConfiguredWorker | undefined;
}

/** `26-97`: a returned reconciliation, plus whose schedule it belongs to - the re-cut screen is
 * per-worker (`/calendar/masters/:workerId/recut`), and the server's own answer carries the days
 * without the worker, because the request already named the rule. */
type WorkingHoursNotice = WorkingHoursReconciliation & { workerId: string | null };

function workingHoursRows(configuration: TenantConfiguration): WorkingHoursRuleRow[] {
  return configuration.calendars.flatMap((calendar) =>
    calendar.workingHours.map((rule) => {
      const worker = configuration.workers.find((candidate) => candidate.workerId === rule.workerId);
      return {
        rule,
        calendarName: calendar.name,
        workerName: worker?.displayName ?? rule.workerId,
        worker,
      };
    }),
  );
}

// `22-22` found and fixed this screen's embed snippet - `data-booking` was handed this tenant's
// calendar public key while the widget tested `dataset["booking"] === "true"`, so a real key
// evaluated to false and the booking chip silently never rendered. `23-105` (`docs/backlog/23-105-*
// .md`, `adr/0151`) found the snippet itself was the wrong fix: booking is an entitlement, and
// `adr/0151` says only the platform grants one - a shop's own page asserting it (via any attribute,
// spelled correctly or not) was never this screen's promise to keep. This screen no longer emits an
// embed snippet at all; `ago-widget` now learns whether booking is enabled from the same handshake
// response that already carries colour, position and locale (`VisitorSessionResponse.enabledModules`),
// so a page pasted before this shipped and never touched again gets booking the moment the platform
// grants it. `InstallSnippetPage` is unchanged and remains the one screen that emits an embed tag -
// it never carried `data-booking`, so after this there is exactly one snippet in the console and
// nothing product-specific in it, which is the information-architecture question `22-22` recorded.

function OriginsForm({
  origins,
  disabled,
  strings,
  onSubmit,
}: {
  origins: string[];
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (origins: string[]) => void;
}) {
  const [text, setText] = useState(origins.join("\n"));

  // `23-96`: adjusted during render, not in an effect - `react-hooks/set-state-in-effect` (v7) flags a
  // synchronous `setState` in an effect body; comparing against the previous `origins` here
  // (react.dev/learn/you-might-not-need-an-effect, "Adjusting some state when a prop changes")
  // re-seeds `text` on the same render `origins` changes, matching the old effect's behaviour exactly
  // (including that it has no "touched" guard - a fresh `origins` still overwrites unsaved local edits).
  const [prevOrigins, setPrevOrigins] = useState(origins);
  if (origins !== prevOrigins) {
    setPrevOrigins(origins);
    setText(origins.join("\n"));
  }

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(
          text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        );
      }}
    >
      <Field label={strings.calendarSetupOriginsFieldLabel}>
        {(controlProps) => (
          <Textarea {...controlProps} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={strings.siteAddressPlaceholder} disabled={disabled} />
        )}
      </Field>
      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {strings.calendarSetupSaveOriginsButton}
        </Button>
      </div>
    </form>
  );
}

/** `25-53`: the current-calendars card's own table. `renderRowActions`-shaped inline (an Edit
 * button only, `onEdit`) rather than a `renderRowActions` slot the way `calendar/WorkersTable.tsx`
 * takes one - a single always-present action does not need that component's own generality, and
 * `CalendarSetupPage.tsx`'s own doc comment names why there is no second (delete) action to make room
 * for. */
function CalendarsTable({
  calendars,
  strings,
  onEdit,
  editDisabled,
}: {
  calendars: ConfiguredCalendar[];
  strings: ConsoleStrings;
  onEdit: (calendar: ConfiguredCalendar) => void;
  editDisabled: boolean;
}) {
  if (calendars.length === 0) {
    return <p className="ago-meta">{strings.calendarCalendarsEmpty}</p>;
  }

  const columns: TableColumn<ConfiguredCalendar>[] = [
    { key: "name", header: strings.calendarSetupCalendarNameLabel, render: (calendar) => calendar.name },
    { key: "zone", header: strings.calendarSetupCalendarZoneLabel, render: (calendar) => calendar.timeZone },
    {
      key: "status",
      header: strings.calendarSetupCalendarPublishedLabel,
      render: (calendar) => (calendar.isPublished ? strings.calendarPublishedLabel : strings.calendarNotPublishedLabel),
    },
    {
      key: "actions",
      header: strings.calendarCalendarsColumnActions,
      render: (calendar) => (
        <Button size="sm" disabled={editDisabled} onClick={() => onEdit(calendar)}>
          {strings.calendarEditButton}
        </Button>
      ),
    },
  ];

  return (
    <Table
      caption={strings.calendarSetupCalendarsTitle}
      columns={columns}
      rows={calendars}
      rowKey={(calendar) => calendar.calendarId}
    />
  );
}

function CalendarForm({
  disabled,
  strings,
  initial,
  submitLabel,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  /** `25-53`: present exactly when this form is editing an existing calendar rather than creating
   * one - `CalendarSetupPage`'s own `editingCalendar` state. Prefills the three fields
   * `updateCalendar` accepts; `calendarId` itself is never a field, only the closure over it in the
   * caller's own `onSubmit`. */
  initial?: ConfiguredCalendar;
  /** Defaults to the create button's own label - the edit panel passes `siteConfigSaveButton`
   * instead, the same "Save", not "Add", every other edit-in-place form in this console uses. */
  submitLabel?: string;
  onSubmit: (body: { name: string; timeZone: string; publish: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? "Europe/Moscow");
  const [publish, setPublish] = useState(initial?.isPublished ?? true);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit({ name, timeZone, publish });
        if (initial === undefined) {
          setName("");
        }
      }}
    >
      <Field label={strings.calendarSetupCalendarNameLabel}>
        {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />}
      </Field>

      <Field label={strings.calendarSetupCalendarZoneLabel}>
        {/* `25-16`: a curated, localized dropdown - never free text. The *stored* value is still an
            IANA zone id, never an offset (wrong for half the year in any zone with DST, and this
            value can never change once slots exist - unchanged from the source); only how a tenant
            picks it changed. `timeZoneOptions` also guarantees the currently-selected value always
            has a matching `<option>`, even for a saved zone outside the curated eleven. */}
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

      <label className="ago-row">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={disabled} />
        <span>{strings.calendarSetupCalendarPublishedLabel}</span>
      </label>

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {submitLabel ?? strings.calendarSetupAddCalendarButton}
        </Button>
      </div>
    </form>
  );
}

function WorkingHoursForm({
  configuration,
  disabled,
  strings,
  onSubmit,
}: {
  configuration: TenantConfiguration;
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: { calendarId: string; workerId: string; dayOfWeek: number; startsAt: string; endsAt: string }) => void;
}) {
  const [workerId, setWorkerId] = useState(configuration.workers[0]?.workerId ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("18:00");

  if (configuration.workers.length === 0) {
    return <p className="ago-meta">{strings.calendarSetupNoWorkersNote}</p>;
  }

  const worker = configuration.workers.find((candidate) => candidate.workerId === workerId) ?? configuration.workers[0];
  const calendar = configuration.calendars.find((candidate) => candidate.workerIds.includes(worker.workerId));
  const days = weekdayNames(strings);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (calendar === undefined) {
          return;
        }
        onSubmit({ calendarId: calendar.calendarId, workerId: worker.workerId, dayOfWeek, startsAt, endsAt });
      }}
    >
      <Field label={strings.calendarWorkerFieldLabel}>
        {(controlProps) => (
          <Select {...controlProps} value={worker.workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={disabled}>
            {configuration.workers.map((candidate) => (
              <option key={candidate.workerId} value={candidate.workerId}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <HoursFields
        disabled={disabled}
        strings={strings}
        days={days}
        dayOfWeek={dayOfWeek}
        startsAt={startsAt}
        endsAt={endsAt}
        onDayOfWeek={setDayOfWeek}
        onStartsAt={setStartsAt}
        onEndsAt={setEndsAt}
      />

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled || calendar === undefined}>
          {strings.calendarSetupAddWorkingHoursButton}
        </Button>
      </div>
      {calendar === undefined && <p className="ago-meta">{strings.calendarSetupWorkerNotOnCalendarNote}</p>}
    </form>
  );
}

/** `26-97`: the weekday and the two wall-clock times - the three fields a human types and can
 * mistype, shared by the add form above and the edit form below. Extracted rather than duplicated
 * precisely because this item exists to fix a typo in them: two copies is two places for the next
 * change to reach only one of. */
function HoursFields({
  disabled,
  strings,
  days,
  dayOfWeek,
  startsAt,
  endsAt,
  onDayOfWeek,
  onStartsAt,
  onEndsAt,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  days: string[];
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  onDayOfWeek: (value: number) => void;
  onStartsAt: (value: string) => void;
  onEndsAt: (value: string) => void;
}) {
  return (
    <>
      <Field label={strings.calendarDayFieldLabel}>
        {(controlProps) => (
          <Select {...controlProps} value={dayOfWeek} onChange={(e) => onDayOfWeek(Number(e.target.value))} disabled={disabled}>
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={strings.calendarOpensFieldLabel}>
        {(controlProps) => <Input {...controlProps} type="time" value={startsAt} onChange={(e) => onStartsAt(e.target.value)} disabled={disabled} />}
      </Field>

      <Field label={strings.calendarClosesFieldLabel}>
        {(controlProps) => <Input {...controlProps} type="time" value={endsAt} onChange={(e) => onEndsAt(e.target.value)} disabled={disabled} />}
      </Field>
    </>
  );
}

/**
 * `26-97`: the current working-hours rules, with the actions column this list did not have until the
 * server grew the two verbs behind it. Flat across calendars rather than nested inside the calendars
 * table, for the reason `25-53` gives for the calendars list itself: a row with its own id and its
 * own write belongs in a table with its own actions, not in a cell of somebody else's.
 */
function WorkingHoursTable({
  rows,
  days,
  strings,
  actionsDisabled,
  onEdit,
  onDelete,
}: {
  rows: WorkingHoursRuleRow[];
  days: string[];
  strings: ConsoleStrings;
  actionsDisabled: boolean;
  onEdit: (row: WorkingHoursRuleRow) => void;
  onDelete: (row: WorkingHoursRuleRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="ago-meta">{strings.calendarWorkingHoursEmpty}</p>;
  }

  const columns: TableColumn<WorkingHoursRuleRow>[] = [
    { key: "worker", header: strings.calendarWorkerFieldLabel, render: (row) => row.workerName },
    { key: "calendar", header: strings.calendarSetupCalendarNameLabel, render: (row) => row.calendarName },
    { key: "day", header: strings.calendarDayFieldLabel, render: (row) => days[row.rule.dayOfWeek] },
    {
      key: "hours",
      header: strings.calendarCalendarsColumnHours,
      render: (row) => `${row.rule.startsAt}–${row.rule.endsAt}`,
    },
    {
      key: "actions",
      header: strings.calendarCalendarsColumnActions,
      render: (row) => (
        <div className="ago-row">
          <Button size="sm" disabled={actionsDisabled} onClick={() => onEdit(row)}>
            {strings.calendarEditButton}
          </Button>
          <Button size="sm" variant="danger" disabled={actionsDisabled} onClick={() => onDelete(row)}>
            {strings.calendarDeleteButton}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Table
      caption={strings.calendarSetupWorkingHoursTitle}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.rule.ruleId}
    />
  );
}

/** `26-97`: the edit form - the same three fields as the add form, and deliberately no worker or
 * calendar select. A rule is corrected where it is; the server refuses to move one
 * (`WorkingHoursRule.ChangeTo`), so offering the choice here would be offering something that cannot
 * happen. */
function WorkingHoursFieldsForm({
  disabled,
  strings,
  days,
  initial,
  submitLabel,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  days: string[];
  initial: WorkingHoursRule;
  submitLabel: string;
  onSubmit: (body: { dayOfWeek: number; startsAt: string; endsAt: string }) => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit({ dayOfWeek, startsAt, endsAt });
      }}
    >
      <HoursFields
        disabled={disabled}
        strings={strings}
        days={days}
        dayOfWeek={dayOfWeek}
        startsAt={startsAt}
        endsAt={endsAt}
        onDayOfWeek={setDayOfWeek}
        onStartsAt={setStartsAt}
        onEndsAt={setEndsAt}
      />
      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * `26-97`: the one thing this item must not do is leave an already-booked slot silently
 * unreconciled. The correction itself is always allowed - it cannot damage a booking, because the
 * materialiser only ever inserts into days that have no rows at all - so what is owed to the operator
 * is not a refusal but this: which days still carry the old hours, how many live bookings are on
 * them, and where to go to re-cut. Rendered until the next working-hours write replaces it, never
 * auto-dismissed.
 */
function RecutNotice({ notice, strings }: { notice: WorkingHoursNotice; strings: ConsoleStrings }) {
  return (
    <Alert tone="info">
      {strings.calendarWorkingHoursRecutNoticeIntro}
      <strong>{notice.alreadyCutDays.join(", ")}</strong>.
      {notice.liveBookingCount > 0 ? (
        <>
          {strings.calendarWorkingHoursRecutNoticeBookingsPrefix}
          <strong>{notice.liveBookingCount}</strong>.
        </>
      ) : (
        strings.calendarWorkingHoursRecutNoticeBookingsNone
      )}
      {strings.calendarWorkingHoursRecutNoticeActionPrefix}
      <strong>{notice.recutFrom}</strong>
      {notice.workerId !== null && (
        <>
          {" · "}
          <Link to={`/calendar/masters/${encodeURIComponent(notice.workerId)}/recut`}>
            {strings.calendarRecutLinkLabel}
          </Link>
        </>
      )}
    </Alert>
  );
}
