import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarApiError, getWorkerSchedule, saveWorkerSchedule, type WorkerSchedule } from "../api/calendarApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { calendarErrorMessage } from "../pages/calendarErrorMessage.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton } from "../components/Spinner.js";

const DEFAULT_HORIZON_DAYS = 30;
const MAX_HORIZON_DAYS = 180;

/**
 * `22-06`/`20-14`: the schedule section of the worker card - moved from `ago-calendar-console`'s own
 * `src/components/WorkerScheduleSection.tsx`, rewritten against `ago-console`'s closed eleven-
 * component set (`WorkersTable.tsx`'s own doc comment has the "why a rewrite" reasoning shared by
 * every calendar screen). `useAuth()` now comes from this console's own `auth/AuthContext.js`
 * (the `ago-console` Keycloak client's token), not the source console's own auth stack, which this
 * item retires along with everything else in `ago-calendar-console`.
 *
 * <b>One form, whichever kind is active, and a create-or-replace save either way.</b> Unchanged from
 * the source: there is no separate "add a schedule" flow, and the first `PUT` creates the row the
 * server was missing (`SaveWorkerSchedule`'s own remarks call this an upsert).
 *
 * <b>Switching kind is a warning, not a confirmation gate.</b> Unchanged - see the source component's
 * own remarks for why a second click is not required here.
 */
export interface WorkerScheduleSectionProps {
  workerId: string;
}

type FormState = {
  kind: "Weekly" | "Cycle";
  slotMinutes: string;
  bufferMinutes: string;
  horizonDays: string;
  materializeFrom: string;
  cycleAnchor: string;
  cycleWorkingDays: string;
  cycleRestDays: string;
  cycleStartsAt: string;
  cycleEndsAt: string;
  buffersCountTowardServiceDuration: boolean;
};

/** `20-18`: the fixed illustrative service length the arithmetic note is worked through with - the
 * item's own 70-minute example, not any real service on this tenant's catalogue. */
const ARITHMETIC_EXAMPLE_MINUTES = 70;

/** The item's own worked arithmetic (`ConsecutiveRunFinder.ComputeSlotsNeeded`'s exact rule,
 * mirrored here for display only - the server's own copy is the one that ever decides anything). */
function slotsNeededFor(durationMinutes: number, slotMinutes: number, bufferMinutes: number, buffersCount: boolean): number {
  if (buffersCount) {
    return Math.ceil((durationMinutes + bufferMinutes) / (slotMinutes + bufferMinutes));
  }

  return Math.ceil(durationMinutes / slotMinutes);
}

function formatClock(totalMinutesFromMidnight: number): string {
  const hours = Math.floor(totalMinutesFromMidnight / 60) % 24;
  const minutes = totalMinutesFromMidnight % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Russian's three-way plural (1 / 2-4 / 5+), unchanged from the source component. */
function slotWord(strings: ConsoleStrings, count: number): string {
  if (count === 1) {
    return strings.calendarSlotWordOne;
  }
  return count < 5 ? strings.calendarSlotWordFew : strings.calendarSlotWordMany;
}

function defaultForm(): FormState {
  return {
    kind: "Weekly",
    slotMinutes: "30",
    bufferMinutes: "0",
    horizonDays: String(DEFAULT_HORIZON_DAYS),
    materializeFrom: today(),
    cycleAnchor: today(),
    cycleWorkingDays: "2",
    cycleRestDays: "2",
    cycleStartsAt: "09:00",
    cycleEndsAt: "18:00",
    buffersCountTowardServiceDuration: true,
  };
}

function formFrom(schedule: WorkerSchedule): FormState {
  return {
    kind: schedule.kind,
    slotMinutes: String(schedule.slotMinutes),
    bufferMinutes: String(schedule.bufferMinutes),
    horizonDays: String(schedule.horizonDays),
    materializeFrom: schedule.materializeFrom,
    cycleAnchor: schedule.cycleAnchor ?? today(),
    cycleWorkingDays: schedule.cycleWorkingDays === null ? "2" : String(schedule.cycleWorkingDays),
    cycleRestDays: schedule.cycleRestDays === null ? "2" : String(schedule.cycleRestDays),
    cycleStartsAt: schedule.cycleStartsAt ?? "09:00",
    cycleEndsAt: schedule.cycleEndsAt ?? "18:00",
    buffersCountTowardServiceDuration: schedule.buffersCountTowardServiceDuration,
  };
}

export function WorkerScheduleSection({ workerId }: WorkerScheduleSectionProps) {
  const { user } = useAuth();
  const strings = useStrings();
  const [existing, setExisting] = useState<WorkerSchedule | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      setLoading(true);
      try {
        const schedule = await getWorkerSchedule(accessToken, workerId, signal);
        setExisting(schedule);
        setForm(formFrom(schedule));
        setError(null);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }

        if (reason instanceof CalendarApiError && reason.code === "configuration.no_schedule") {
          setExisting(null);
          setForm(defaultForm());
          setError(null);
        } else {
          setError(calendarErrorMessage(reason, strings));
        }
      } finally {
        setLoading(false);
      }
    },
    [workerId, user?.access_token, strings],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const saved = await saveWorkerSchedule(accessToken, workerId, {
        kind: form.kind,
        cycleAnchor: form.kind === "Cycle" ? form.cycleAnchor : null,
        cycleWorkingDays: form.kind === "Cycle" ? Number(form.cycleWorkingDays) : null,
        cycleRestDays: form.kind === "Cycle" ? Number(form.cycleRestDays) : null,
        cycleStartsAt: form.kind === "Cycle" ? form.cycleStartsAt : null,
        cycleEndsAt: form.kind === "Cycle" ? form.cycleEndsAt : null,
        slotMinutes: Number(form.slotMinutes),
        bufferMinutes: Number(form.bufferMinutes),
        horizonDays: Number(form.horizonDays),
        materializeFrom: form.materializeFrom,
        buffersCountTowardServiceDuration: form.buffersCountTowardServiceDuration,
      });
      setExisting(saved);
      setForm(formFrom(saved));
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Panel title={strings.calendarScheduleSectionTitle} quiet>
        <Skeleton lines={3} label={strings.calendarLoading} />
      </Panel>
    );
  }

  // Only the Cycle -> Weekly direction actually clears anything - unchanged from the source.
  const switchingAwayFromCycle = existing !== null && existing.kind === "Cycle" && form.kind === "Weekly";

  const arithmeticNote = (() => {
    const slotMinutes = Number(form.slotMinutes);
    const bufferMinutes = Number(form.bufferMinutes);
    if (!Number.isFinite(slotMinutes) || slotMinutes <= 0 || !Number.isFinite(bufferMinutes) || bufferMinutes < 0) {
      return null;
    }

    const slotsNeeded = slotsNeededFor(ARITHMETIC_EXAMPLE_MINUTES, slotMinutes, bufferMinutes, form.buffersCountTowardServiceDuration);
    const spanMinutes = slotsNeeded * slotMinutes + (slotsNeeded - 1) * bufferMinutes;
    const exampleStart = 12 * 60; // 12:00, the item's own illustrative anchor.

    return (
      <p className="ago-field__description">
        {strings.calendarArithmeticExamplePrefix}
        {ARITHMETIC_EXAMPLE_MINUTES}
        {strings.calendarArithmeticExampleUnitSuffix}
        {slotsNeeded} {slotWord(strings, slotsNeeded)}, {formatClock(exampleStart)}–{formatClock(exampleStart + spanMinutes)}.
      </p>
    );
  })();

  return (
    <Panel title={strings.calendarScheduleSectionTitle} quiet>
      {existing === null && <p className="ago-meta">{strings.calendarScheduleEmptyNote}</p>}
      {error !== null && <Alert tone="danger">{error}</Alert>}

      <form className="ago-stack" onSubmit={(event) => void handleSubmit(event)}>
        <Field label={strings.calendarTemplateFieldLabel}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as "Weekly" | "Cycle" })}
            >
              <option value="Weekly">{strings.calendarWeeklyTemplateOption}</option>
              <option value="Cycle">{strings.calendarCycleTemplateOption}</option>
            </Select>
          )}
        </Field>
        {switchingAwayFromCycle && <p className="ago-field__description">{strings.calendarSwitchingToWeeklyNote}</p>}

        {form.kind === "Cycle" && (
          <>
            <Field label={strings.calendarCycleAnchorFieldLabel}>
              {(controlProps) => (
                <Input {...controlProps} type="date" value={form.cycleAnchor} onChange={(e) => setForm({ ...form, cycleAnchor: e.target.value })} required />
              )}
            </Field>

            <Field label={strings.calendarCycleWorkingDaysFieldLabel} description={strings.calendarCycleShiftPatternNote}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={1}
                  value={form.cycleWorkingDays}
                  onChange={(e) => setForm({ ...form, cycleWorkingDays: e.target.value })}
                  required
                />
              )}
            </Field>

            <Field label={strings.calendarCycleRestDaysFieldLabel}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={0}
                  value={form.cycleRestDays}
                  onChange={(e) => setForm({ ...form, cycleRestDays: e.target.value })}
                  required
                />
              )}
            </Field>

            <Field label={strings.calendarOpensFieldLabel}>
              {(controlProps) => (
                <Input {...controlProps} type="time" value={form.cycleStartsAt} onChange={(e) => setForm({ ...form, cycleStartsAt: e.target.value })} required />
              )}
            </Field>

            <Field label={strings.calendarClosesFieldLabel}>
              {(controlProps) => (
                <Input {...controlProps} type="time" value={form.cycleEndsAt} onChange={(e) => setForm({ ...form, cycleEndsAt: e.target.value })} required />
              )}
            </Field>
          </>
        )}

        {form.kind === "Weekly" && <p className="ago-field__description">{strings.calendarWeeklyHoursNote}</p>}

        <Field label={strings.calendarSlotLengthFieldLabel} description={strings.calendarSlotLengthNote}>
          {(controlProps) => (
            <Input {...controlProps} type="number" min={1} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })} required />
          )}
        </Field>

        <Field label={strings.calendarBufferFieldLabel}>
          {(controlProps) => (
            <Input {...controlProps} type="number" min={0} value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: e.target.value })} />
          )}
        </Field>

        <label className="ago-row">
          <input
            type="checkbox"
            checked={form.buffersCountTowardServiceDuration}
            onChange={(e) => setForm({ ...form, buffersCountTowardServiceDuration: e.target.checked })}
          />
          <span>{strings.calendarBufferCountsTowardDurationLabel}</span>
        </label>
        {arithmeticNote}

        <Field label={strings.calendarHorizonFieldLabel} description={`${strings.calendarHorizonCapPrefix}${MAX_HORIZON_DAYS}${strings.calendarHorizonCapSuffix}`}>
          {(controlProps) => (
            // No client-side `max`: the cap is enforced server-side (WorkerSchedule.MaxHorizonDays),
            // on purpose, unchanged from the source component.
            <Input {...controlProps} type="number" min={0} value={form.horizonDays} onChange={(e) => setForm({ ...form, horizonDays: e.target.value })} required />
          )}
        </Field>

        <Field
          label={strings.calendarMaterializeFromFieldLabel}
          description={
            existing !== null
              ? `${strings.calendarMaterializeFromCannotMoveEarlierPrefix}${existing.materializeFrom}${strings.calendarMaterializeFromCannotMoveEarlierSuffix}`
              : undefined
          }
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              min={existing?.materializeFrom}
              value={form.materializeFrom}
              onChange={(e) => setForm({ ...form, materializeFrom: e.target.value })}
              required
            />
          )}
        </Field>
        {/* `20-16`: this save can only move the cursor forward - moving it back is a separate,
            destructive screen with its own preview and confirmation. */}
        {existing !== null && (
          <p className="ago-field__description">
            {strings.calendarScheduleRecutNotePrefix}
            <Link to={`/calendar/workers/${workerId}/recut`}>{strings.calendarScheduleRecutLinkLabel}</Link>
            {strings.calendarScheduleRecutNoteSuffix}
          </p>
        )}

        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={busy}>
            {existing === null ? strings.calendarCreateScheduleButton : strings.calendarSaveScheduleButton}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
