import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { ConfiguredCalendar, ConfiguredService, WorkerDetail } from "../api/calendarApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";

/**
 * `22-06`/`20-13`: one card, used for both creating a worker and editing one - moved from
 * `ago-calendar-console`'s own `src/components/WorkerCard.tsx`, rewritten against `ago-console`'s
 * closed eleven-component set (`Field`/`Input`/`Select`/`Button`/`Panel`) rather than the source
 * console's bare-HTML markup. See `WorkersTable.tsx`'s own doc comment for why a rewrite, not a port,
 * is this item's answer for every calendar screen: the source console predates `11-05` and was never
 * meant to converge visually with this one.
 *
 * <b>The display-name field prefills with the derived value and only marks it custom when a human
 * actually edits it.</b> Tracked entirely client-side, unchanged from the source component - see
 * that file's own remarks for why (comparing strings would be fooled by a coincidental match; asking
 * the server first would be a round trip before every keystroke). The actual freezing guarantee is
 * enforced server-side, in `Worker.Rename`/`Worker.SetDisplayName` (`Ago.Calendar.Domain`) - this
 * component only decides what one submission sends, never what the rule is.
 *
 * <b>Extensibility.</b> `children`, rendered after the base fields whenever a worker is being edited
 * (never on create) - the schedule section's own slot, unchanged from the source.
 */
export interface WorkerCardFields {
  lastName: string;
  firstName: string;
  middleName: string | null;
  /** Non-null only when the human edited the display-name field this session - see the component's
   * own remarks. */
  displayName: string | null;
  isActive: boolean;
  /** Only meaningful (and only sent) on create - v1 is one calendar per worker, chosen once. */
  calendarId: string;
  serviceIds: string[];
}

export interface WorkerCardProps {
  mode: "create" | "edit";
  worker?: WorkerDetail;
  calendars: ConfiguredCalendar[];
  services: ConfiguredService[];
  busy: boolean;
  onSubmit: (fields: WorkerCardFields) => void;
  onCancel: () => void;
  children?: ReactNode;
}

function derive(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.split(/\s+/).filter((part) => part.length > 0).join(" ");
}

export function WorkerCard({ mode, worker, calendars, services, busy, onSubmit, onCancel, children }: WorkerCardProps) {
  const strings = useStrings();
  const [lastName, setLastName] = useState(worker?.lastName ?? "");
  const [firstName, setFirstName] = useState(worker?.firstName ?? "");
  const [middleName, setMiddleName] = useState(worker?.middleName ?? "");
  const [displayName, setDisplayName] = useState(worker?.displayName ?? "");
  // Seeded from the worker's own flag (edit mode) so an already-custom name does not silently start
  // re-deriving the moment somebody edits the last name - the same rule Worker.Rename enforces
  // server-side, mirrored here only for what the field shows while typing.
  const [displayNameTouched, setDisplayNameTouched] = useState(worker?.displayNameIsCustom ?? false);
  const [isActive, setIsActive] = useState(worker?.isActive ?? true);
  const [calendarId, setCalendarId] = useState(calendars[0]?.calendarId ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!displayNameTouched) {
      setDisplayName(derive(firstName, lastName));
    }
  }, [firstName, lastName, displayNameTouched]);

  if (mode === "create" && calendars.length === 0) {
    return <p className="ago-meta">{strings.calendarWorkerCardNoCalendarNote}</p>;
  }

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit({
          lastName,
          firstName,
          middleName: middleName.trim() === "" ? null : middleName,
          displayName: displayNameTouched ? displayName : null,
          isActive,
          calendarId: calendarId || calendars[0]?.calendarId || "",
          serviceIds,
        });
      }}
    >
      <Field label={strings.calendarLastNameFieldLabel}>
        {(controlProps) => (
          <Input {...controlProps} value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={busy} />
        )}
      </Field>

      <Field label={strings.calendarFirstNameFieldLabel}>
        {(controlProps) => (
          <Input {...controlProps} value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={busy} />
        )}
      </Field>

      <Field label={strings.calendarMiddleNameFieldLabel}>
        {(controlProps) => (
          <Input {...controlProps} value={middleName} onChange={(e) => setMiddleName(e.target.value)} disabled={busy} />
        )}
      </Field>

      <Field
        label={strings.calendarDisplayNameFieldLabel}
        description={displayNameTouched ? strings.calendarDisplayNameCustomNote : strings.calendarDisplayNameDerivedNote}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            value={displayName}
            onChange={(e) => {
              setDisplayNameTouched(true);
              setDisplayName(e.target.value);
            }}
            disabled={busy}
          />
        )}
      </Field>

      {mode === "create" && (
        <>
          <Field label={strings.calendarCalendarFieldLabel}>
            {(controlProps) => (
              // One calendar per worker in v1 - a single select, not a multi-select, because the
              // aggregate refuses a second and a multi-select would promise a shape it will not accept.
              <Select {...controlProps} value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={busy}>
                {calendars.map((calendar) => (
                  <option key={calendar.calendarId} value={calendar.calendarId}>
                    {calendar.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <fieldset className="ago-stack">
            <legend>{strings.calendarServicesPerformedLegend}</legend>
            {services.map((service) => (
              <label className="ago-row" key={service.serviceId}>
                <input
                  type="checkbox"
                  checked={serviceIds.includes(service.serviceId)}
                  disabled={busy}
                  onChange={(e) =>
                    setServiceIds((current) =>
                      e.target.checked ? [...current, service.serviceId] : current.filter((id) => id !== service.serviceId),
                    )
                  }
                />
                <span>{service.name}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}

      {mode === "edit" && (
        <label className="ago-row">
          <input type="checkbox" checked={isActive} disabled={busy} onChange={(e) => setIsActive(e.target.checked)} />
          <span>{strings.calendarActiveLabel}</span>
        </label>
      )}

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={busy}>
          {mode === "create" ? strings.calendarAddWorkerButton : strings.siteConfigSaveButton}
        </Button>
        <Button type="button" onClick={onCancel} disabled={busy}>
          {strings.cancelButton}
        </Button>
      </div>

      {mode === "edit" && children}
    </form>
  );
}
