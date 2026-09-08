import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { createService, getConfiguration, type TenantConfiguration } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
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
 */
export function CalendarServicesPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <ul>
          {configuration.services.map((service) => (
            <li key={service.serviceId}>
              {service.name} · {service.durationMinutes}
              {strings.calendarSetupServiceMinutesSuffix}
              {service.priceMinorUnits !== null && (
                <> · {formatPrice(service.priceMinorUnits, service.priceIsFrom)}</>
              )}
              {service.description !== null && (
                // `.ago-field__description`'s own small/secondary treatment, reused rather than a
                // new class invented for one line - it already means exactly this.
                <div className="ago-field__description">{service.description}</div>
              )}
            </li>
          ))}
        </ul>
        <ServiceForm
          disabled={busy}
          strings={strings}
          onSubmit={(body) => void run(() => createService(accessToken, body))}
        />
      </Panel>
    </>
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

function ServiceForm({
  disabled,
  strings,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: {
    name: string;
    durationMinutes: number;
    priceMinorUnits?: number | null;
    priceIsFrom?: boolean;
    description?: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [priceRubles, setPriceRubles] = useState("");
  const [priceIsFrom, setPriceIsFrom] = useState(false);
  const [description, setDescription] = useState("");

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
        });
        setName("");
        setPriceRubles("");
        setPriceIsFrom(false);
        setDescription("");
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

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {strings.calendarSetupAddServiceButton}
        </Button>
      </div>
    </form>
  );
}
