import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  createService,
  getConfiguration,
  updateService,
  type ConfiguredService,
  type TenantConfiguration,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-31`: `/calendar/services` - the services dictionary, carved out of `/calendar/setup`
 * (`CalendarSetupPage`) onto its own screen. The item's own table names why: dictionaries-first,
 * then what came of them, then configuration last, and a service is one of the dictionaries a
 * booking is built from (alongside masters and the schedule), not part of the embed/calendars/
 * working-hours configuration `/calendar/setup` still owns after this split.
 *
 * **No new API for name/duration.** `TenantConfiguration.services` and `createService` already
 * existed for `CalendarSetupPage`'s own combined screen - this page reads and writes those two
 * fields exactly as before, only from a route of its own. Re-fetches the whole configuration on
 * mount and after every write, the same "no optimistic update, no client-side cache, the
 * authoritative answer is always the next GET" discipline `CalendarSetupPage`'s own doc comment
 * states for the source screen this was split from.
 *
 * **`23-35`: price and description, both optional, independently.** `23-31` deliberately left this
 * screen at name-and-duration and named `23-35` as the item that would decide whether to grow it -
 * the author answered "a service has a price and a description" on 2026-09-06, and this is that
 * answer built. A price is entered in whole rubles (`priceRubles`, converted to
 * `Ago.Calendar.Domain.Money`'s own kopecks at the API boundary in {@link toPriceMinorUnits} - the
 * server never sees a fractional-ruble string) and left blank for "no stated price", which the
 * server keeps as `null` rather than a zero standing in for absence. The "от" checkbox answers what
 * a price means when the real cost depends on the master or the job's own length: the operator
 * marks a service's number as a floor rather than the product picking one universal reading (see
 * `Ago.Calendar.Domain.Service`'s own remarks) - disabled whenever no price is entered, since it is
 * meaningless without one.
 *
 * **Shown to the visitor, not only the operator - decided the same day.** `20-06`'s booking widget
 * and its chat-channel equivalent both read the identical `price`/`description` fields this screen
 * writes, through the embed's own scoped read path (`EmbedScopeResolver`) - a commercial promise a
 * shop states here is one a stranger sees before booking, the same way a real salon's own booking
 * page does. Never carried into the booking confirmation, which is deliberately silent about it -
 * see `Ago.Calendar.Contracts.BookingConfirmedResponse`'s own remarks.
 *
 * **`25-53`: two blocks, not one blended card.** This screen was the item's own named example of the
 * one-card antipattern - a title, the existing services as a plain `<ul>`, then the create form,
 * all in one `<Panel>`. Split into a "current services" card (a real `Table`) and a separate
 * "add service" card below, unchanged in substance.
 *
 * **`26-96`: the actions column `23-31` and `25-53` both had to leave out.** Both items named the
 * same gap in the same words - `calendarApi.ts` exported `createService` and nothing else, so a typo
 * in a duration or a visitor-facing price was permanent, and `ConfiguredService` carried no
 * active/inactive concept at all. `PUT /services/{id}` closed it, and this screen is where it
 * surfaces:
 *
 * - **Изменить** opens the identical `ServiceForm` the "add service" card uses, prefilled - one form
 *   rather than two that can drift, the same both-modes-one-card shape `CalendarWorkersPage`'s own
 *   `WorkerCard` already has.
 * - **«Снять с продажи»** is a row-level toggle, not a delete, and its label says so. The server has
 *   no `DELETE /services/{id}` and is not getting one: four of its read models resolve a *past
 *   booking's* service name through the same row, so deleting a service would retroactively blank it
 *   on every booking that ever used it (`Ago.Calendar.Domain.Service.IsActive`). The toggle sends the
 *   row's own five current fields back beside the flipped flag, because the endpoint has replace
 *   semantics - exactly what `CalendarWorkersPage` does when it flips a worker's `isActive`.
 * - The **Статус** column renders the flag, so a withdrawn service is visibly present rather than
 *   silently missing. Withdrawn services are deliberately still listed here: `GET /configuration`
 *   keeps returning them (it is what a worker card and a booking row resolve a name through), and it
 *   is the public booking surface that stops offering them.
 */
export function CalendarServicesPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** `26-96`. The service whose edit card is open, or `null` for none - the same single-slot editing
   * state `CalendarWorkersPage` holds, and for the same reason: two cards open at once would let an
   * operator submit the one they stopped looking at. */
  const [editing, setEditing] = useState<ConfiguredService | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }
      try {
        const loaded = await getConfiguration(accessToken, signal);
        setConfiguration(loaded);
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
    // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
    // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
    // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
    // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
    // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
    // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
    // request happen" by accident rather than by decision.
    //
    // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
    // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
    // This marks the one site that is deliberate and leaves the rest of the file an error again.
    //
    // Loads the service catalogue this screen exists to edit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarServices}
        forbiddenMessage={strings.calendarSetupForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarServices} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    // `RequireAuth` guarantees a signed-in session by the time this renders - same "reaching here is
    // a wiring bug" reasoning `CalendarSetupPage`'s own equivalent check states.
    return null;
  }

  if (configuration === null) {
    return (
      <>
        <PageHead title={strings.navCalendarServices} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={3} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={strings.navCalendarServices} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      <Panel title={strings.calendarSetupServicesTitle}>
        <ServicesTable
          services={configuration.services}
          strings={strings}
          renderRowActions={(service) => (
            <div className="ago-row">
              <Button size="sm" disabled={busy} onClick={() => setEditing(service)}>
                {strings.calendarEditButton}
              </Button>
              {/* `26-96`. Never `variant="danger"`: nothing is destroyed here and a red button would
                  promise that it is. Replace semantics mean the row's own five current fields travel
                  back beside the flipped flag - see this file's own doc comment. */}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    updateService(accessToken, service.serviceId, {
                      name: service.name,
                      durationMinutes: service.durationMinutes,
                      priceMinorUnits: service.priceMinorUnits,
                      priceIsFrom: service.priceIsFrom,
                      description: service.description,
                      isActive: !service.isActive,
                    }),
                  )
                }
              >
                {service.isActive ? strings.calendarServicesArchiveButton : strings.calendarServicesRestoreButton}
              </Button>
            </div>
          )}
        />
      </Panel>

      {/* `26-96`. One card, two modes - the edit card replaces the create card rather than sitting
          beside it, so there is never a second form on screen an operator could submit by mistake
          (`CalendarWorkersPage`'s own `editing === null` guard, same shape). `key` on the edit form
          is what makes React rebuild its internal field state when the operator switches straight
          from one row's Edit to another's: without it the second row would open showing the first
          row's typed values. */}
      {editing === null ? (
        <Panel title={strings.calendarNewServiceTitle}>
          <ServiceForm
            disabled={busy}
            strings={strings}
            submitLabel={strings.calendarSetupAddServiceButton}
            // The five fields listed out rather than spread: `isActive` is not one of them, because
            // a service is always created on offer and `CreateServiceRequest` carries no such
            // field - forwarding one the server ignores would suggest a caller could create an
            // already-withdrawn service.
            onSubmit={(body) =>
              void run(() =>
                createService(accessToken, {
                  name: body.name,
                  durationMinutes: body.durationMinutes,
                  priceMinorUnits: body.priceMinorUnits,
                  priceIsFrom: body.priceIsFrom,
                  description: body.description,
                }),
              )
            }
          />
        </Panel>
      ) : (
        <Panel title={strings.calendarEditServiceTitle}>
          <ServiceForm
            key={editing.serviceId}
            disabled={busy}
            strings={strings}
            service={editing}
            submitLabel={strings.calendarSaveServiceButton}
            onCancel={() => setEditing(null)}
            onSubmit={(body) =>
              void run(async () => {
                await updateService(accessToken, editing.serviceId, {
                  name: body.name,
                  durationMinutes: body.durationMinutes,
                  priceMinorUnits: body.priceMinorUnits,
                  priceIsFrom: body.priceIsFrom,
                  description: body.description,
                  isActive: body.isActive,
                });
                setEditing(null);
              })
            }
          />
        </Panel>
      )}
    </>
  );
}

/** `25-53`/`26-96`: the current-services card's own table. It now takes the `renderRowActions` slot
 * `calendar/WorkersTable.tsx` has always had - `25-53` left it out because this object type had no
 * write beyond `createService`; `26-96` gave it one. */
function ServicesTable({
  services,
  strings,
  renderRowActions,
}: {
  services: ConfiguredService[];
  strings: ConsoleStrings;
  renderRowActions: (service: ConfiguredService) => ReactNode;
}) {
  if (services.length === 0) {
    return <p className="ago-meta">{strings.calendarServicesEmpty}</p>;
  }

  const columns: TableColumn<ConfiguredService>[] = [
    { key: "name", header: strings.calendarServicesColumnName, render: (service) => service.name },
    {
      key: "duration",
      header: strings.calendarServicesColumnDuration,
      render: (service) => `${service.durationMinutes}${strings.calendarSetupServiceMinutesSuffix}`,
    },
    {
      key: "price",
      header: strings.calendarServicesColumnPrice,
      render: (service) =>
        service.priceMinorUnits !== null ? formatPrice(service.priceMinorUnits, service.priceIsFrom) : "—",
    },
    {
      key: "description",
      header: strings.calendarServicesColumnDescription,
      render: (service) => service.description ?? "—",
    },
    {
      // `26-96`. A `Badge` with the word in it, matching `WorkersTable`'s own active column exactly -
      // tone alone never carries the meaning (`Badge`'s own `dot` remarks make the same point).
      key: "status",
      header: strings.calendarServicesColumnStatus,
      render: (service) => (
        <Badge tone={service.isActive ? "success" : "neutral"}>
          {service.isActive ? strings.calendarServicesActiveLabel : strings.calendarServicesArchivedLabel}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: strings.calendarServicesColumnActions,
      render: renderRowActions,
    },
  ];

  return (
    <Table
      caption={strings.calendarSetupServicesTitle}
      columns={columns}
      rows={services}
      rowKey={(service) => service.serviceId}
    />
  );
}

/** `23-35`. v1's only currency is `Ago.Calendar.Domain.Money.RubleCode` - see its own remarks for
 * why this is not yet a lookup table keyed by a currency code the console has never received. */
function formatPrice(minorUnits: number, isFrom: boolean): string {
  const rubles = minorUnits % 100 === 0 ? String(minorUnits / 100) : (minorUnits / 100).toFixed(2);
  return isFrom ? `от ${rubles} ₽` : `${rubles} ₽`;
}

/** `23-35`. Kopecks, or `null` for "no stated price" - the inverse of {@link formatPrice}'s own
 * division, and the only place a fractional-ruble string is parsed, so the server never sees one.
 * `null`/blank/whitespace-only all mean the same thing: the operator typed nothing. */
function toPriceMinorUnits(priceRubles: string): number | null {
  const trimmed = priceRubles.trim();
  if (trimmed === "") {
    return null;
  }

  const rubles = Number(trimmed);
  return Number.isFinite(rubles) ? Math.round(rubles * 100) : null;
}

/**
 * `23-35`, extended by `26-96` to serve both modes. `service` undefined is the create card; a
 * `ConfiguredService` prefills every field and adds the «В продаже» checkbox, because that flag only
 * exists on a record that already exists - a service is always created on offer
 * (`Ago.Calendar.Domain.Service.Create`).
 *
 * One component for both rather than a second edit-only form: the five fields, the kopeck conversion
 * and the "от"-without-a-price normalisation are the parts most worth not having two copies of, and a
 * create form that validates differently from the edit form is exactly the drift `Service` itself
 * refuses server-side by routing both through the same validators.
 */
function ServiceForm({
  disabled,
  strings,
  service,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  service?: ConfiguredService;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (body: {
    name: string;
    durationMinutes: number;
    priceMinorUnits: number | null;
    priceIsFrom: boolean;
    description: string | null;
    isActive: boolean;
  }) => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service?.durationMinutes ?? 45);
  // Kopecks back into a ruble string for the input, the exact inverse of `toPriceMinorUnits` - a
  // service with no stated price prefills blank rather than "0", which would be a stated price.
  const [priceRubles, setPriceRubles] = useState(
    service?.priceMinorUnits != null ? String(service.priceMinorUnits / 100) : "",
  );
  const [priceIsFrom, setPriceIsFrom] = useState(service?.priceIsFrom ?? false);
  const [description, setDescription] = useState(service?.description ?? "");
  const [isActive, setIsActive] = useState(service?.isActive ?? true);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        const priceMinorUnits = toPriceMinorUnits(priceRubles);
        onSubmit({
          name,
          durationMinutes,
          priceMinorUnits,
          // Normalised here too, not only server-side: a caller reading this form's own state should
          // never see "от" true beside no price - Service.Create's own normalisation, mirrored.
          priceIsFrom: priceMinorUnits === null ? false : priceIsFrom,
          description: description.trim() === "" ? null : description,
          isActive,
        });

        // `26-96`: only the create card clears itself. An edit card is unmounted by the page the
        // moment its write lands, and blanking its fields first would flash an empty form over the
        // service the operator just corrected.
        if (service === undefined) {
          setName("");
          setPriceRubles("");
          setPriceIsFrom(false);
          setDescription("");
        }
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

      <Field label={strings.calendarSetupServicePriceLabel}>
        {(controlProps) => (
          <Input
            {...controlProps}
            type="number"
            min={0}
            step="0.01"
            value={priceRubles}
            placeholder={strings.calendarSetupServicePricePlaceholder}
            onChange={(e) => setPriceRubles(e.target.value)}
            disabled={disabled}
          />
        )}
      </Field>

      <label className="ago-row">
        <input
          type="checkbox"
          checked={priceIsFrom}
          onChange={(e) => setPriceIsFrom(e.target.checked)}
          disabled={disabled || priceRubles.trim() === ""}
        />
        <span>{strings.calendarSetupServicePriceFromLabel}</span>
      </label>

      <Field label={strings.calendarSetupServiceDescriptionLabel}>
        {(controlProps) => (
          <Textarea {...controlProps} value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} rows={3} />
        )}
      </Field>

      {/* `26-96`. Edit mode only - a service is always created on offer, so the checkbox would have
          exactly one legal value on the create card and a control with one legal value is noise. The
          note below it is rendered whenever the box is cleared, before the save, because that is the
          moment the operator can still change their mind. */}
      {service !== undefined && (
        <>
          <label className="ago-row">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={disabled}
            />
            <span>{strings.calendarServiceActiveFieldLabel}</span>
          </label>
          {!isActive && <Alert tone="info">{strings.calendarServiceArchivedNote}</Alert>}
        </>
      )}

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {submitLabel}
        </Button>
        {onCancel !== undefined && (
          <Button type="button" disabled={disabled} onClick={onCancel}>
            {strings.cancelButton}
          </Button>
        )}
      </div>
    </form>
  );
}
