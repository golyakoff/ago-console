import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  createWorker,
  deleteWorker,
  getConfiguration,
  listWorkers,
  updateWorker,
  type ConfiguredCalendar,
  type ConfiguredService,
  type WorkerDetail,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { WorkersTable } from "../calendar/WorkersTable.js";
import { WorkerCard, type WorkerCardFields } from "../calendar/WorkerCard.js";
import { WorkerScheduleSection } from "../calendar/WorkerScheduleSection.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `22-06`/`adr/0093`: `/calendar/workers` - the tenant's staff list, moved from
 * `ago-calendar-console`'s own `WorkersPage.tsx` and rewritten against this console's closed
 * eleven-component set - see `calendar/WorkersTable.tsx`'s own doc comment for why every calendar
 * screen is a rewrite, not a port.
 *
 * <b>No search, no paging, no filter.</b> Unchanged - ten workers is a lot for this product.
 *
 * <b>Re-reads after every write.</b> Unchanged - no optimistic update.
 *
 * <b>The delete confirmation is a second panel, not a `Dialog`.</b> The source console's own shape
 * (a second `<section>`, not a modal) is kept rather than reached for `ago-console`'s own `Dialog`
 * component: `Dialog.tsx`'s own doc comment already names this exact case ("a confirmation in front
 * of a destructive action") as the kind of thing that *would* justify it, but every other confirm-
 * then-commit flow already in this console (`EraseConversationButton`) uses the identical inline-
 * panel shape, not a modal - matching that precedent keeps this screen consistent with the rest of
 * the console it just joined, rather than introducing the console's first non-drawer `Dialog` for one
 * screen alone.
 */
export function CalendarWorkersPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<WorkerDetail[] | null>(null);
  const [calendars, setCalendars] = useState<ConfiguredCalendar[]>([]);
  const [services, setServices] = useState<ConfiguredService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<WorkerDetail | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<WorkerDetail | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      try {
        const [loadedWorkers, configuration] = await Promise.all([
          listWorkers(accessToken, signal),
          getConfiguration(accessToken, signal),
        ]);
        setWorkers(loadedWorkers);
        setCalendars(configuration.calendars);
        setServices(configuration.services);
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }
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
        title={strings.navCalendarWorkers}
        forbiddenMessage={strings.calendarWorkersForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarWorkers} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    // `RequireAuth` guarantees a signed-in session by the time this renders - same
    // "reaching here is a wiring bug" reasoning `FaqModulePage`/`WidgetConfigPage` state for their
    // own equivalent check. Narrows `accessToken` to `string` for every closure built below (the
    // `WorkerCard`/delete-confirmation `onSubmit`/`onClick` handlers), so none of them need a
    // repeated null check or a non-null assertion.
    return null;
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
      setEditing(null);
      setConfirmingDelete(null);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  if (workers === null) {
    return (
      <>
        <PageHead title={strings.navCalendarWorkers} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={5} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  return (
    <>
      <PageHead title={strings.navCalendarWorkers} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      <Panel title={strings.calendarWorkersTitle}>
        <WorkersTable
          workers={workers}
          renderRowActions={(worker) => (
            <div className="ago-row">
              <Button size="sm" disabled={busy} onClick={() => setEditing(worker)}>
                {strings.calendarEditButton}
              </Button>
              {/* `20-14`: the schedule section lives inside the same edit card (`WorkerCard`'s own
                  children slot), so this is a named shortcut into the same place "Edit" opens. */}
              <Button size="sm" disabled={busy} onClick={() => setEditing(worker)}>
                {strings.calendarScheduleButton}
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmingDelete(worker)}>
                {strings.calendarDeleteButton}
              </Button>
              {/* `Button`, not `Link`, for these two navigations - found live by `ux-gate`'s own
                  "no undersized interactive element" assertion: a bare inline `<a>` sitting between
                  three `Button`s in this same row measured under the 24px minimum target size
                  (`ux-gate/lib/minSize.ts`'s own WCAG 2.5.8 rationale), where `Button`'s own padding
                  already clears it. `useNavigate()` is the one thing this trades away versus a real
                  `<a>` (no middle-click-to-open-in-a-new-tab) - judged a fair price for landing in
                  the same visual/interaction family as the row's other three actions, none of which
                  support that either. */}
              <Button size="sm" onClick={() => void navigate(`/calendar/workers/${worker.workerId}/slots`)}>
                {strings.calendarSlotsLinkLabel}
              </Button>
              <Button size="sm" onClick={() => void navigate(`/calendar/workers/${worker.workerId}/recut`)}>
                {strings.calendarRecutLinkLabel}
              </Button>
            </div>
          )}
        />

        {editing === null && (
          <div className="ago-row">
            <Button variant="primary" disabled={busy || calendars.length === 0} onClick={() => setEditing("new")}>
              {strings.calendarAddWorkerButton}
            </Button>
          </div>
        )}
        {calendars.length === 0 && editing === null && <p className="ago-meta">{strings.calendarWorkersNoCalendarNote}</p>}
      </Panel>

      {editing !== null && (
        <Panel title={editing === "new" ? strings.calendarNewWorkerTitle : strings.calendarEditWorkerTitle}>
          <WorkerCard
            mode={editing === "new" ? "create" : "edit"}
            worker={editing === "new" ? undefined : editing}
            calendars={calendars}
            services={services}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={(fields: WorkerCardFields) =>
              void run(() =>
                editing === "new"
                  ? createWorker(accessToken, {
                      lastName: fields.lastName,
                      firstName: fields.firstName,
                      middleName: fields.middleName,
                      displayName: fields.displayName,
                      calendarId: fields.calendarId,
                      serviceIds: fields.serviceIds,
                    })
                  : updateWorker(accessToken, editing.workerId, {
                      lastName: fields.lastName,
                      firstName: fields.firstName,
                      middleName: fields.middleName,
                      displayName: fields.displayName,
                      isActive: fields.isActive,
                    }),
              )
            }
          >
            {editing !== "new" && (
              <>
                <WorkerScheduleSection workerId={editing.workerId} />
                <p>
                  <Link to={`/calendar/workers/${editing.workerId}/slots`}>{strings.calendarViewSlotsLinkLabel}</Link>
                </p>
              </>
            )}
          </WorkerCard>
        </Panel>
      )}

      {confirmingDelete !== null && (
        <Panel>
          <p>
            {strings.calendarWorkersDeleteConfirmPrefix}
            <strong>{confirmingDelete.displayName}</strong>
            {strings.calendarWorkersDeleteConfirmSuffix}
          </p>
          <div className="ago-row">
            <Button variant="danger" disabled={busy} onClick={() => void run(() => deleteWorker(accessToken, confirmingDelete.workerId))}>
              {strings.calendarDeleteButton}
            </Button>
            <Button disabled={busy} onClick={() => setConfirmingDelete(null)}>
              {strings.cancelButton}
            </Button>
          </div>
        </Panel>
      )}
    </>
  );
}
