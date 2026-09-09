import type { ConsoleStrings } from "../i18n/strings.js";
import type { WorkerSlot } from "../api/calendarApi.js";
import { Button } from "../components/Button.js";

/**
 * `22-06`: locale-aware rendering helpers shared by the calendar screens - moved from
 * `ago-calendar-console`'s own `src/i18n/format.tsx`, with one deliberate change: that file's own
 * `formatDateTime`/`formatTime`/`formatDate` are dropped rather than ported, because they called
 * `Date.prototype.toLocaleString`/etc. with **no zone label at all** - exactly the defect
 * `docs/conventions/date-and-time.md` rule 5 forbids ("an unlabelled timestamp shown to a human is a
 * defect") and the one `ago-console`'s own `time/format.ts` (`343`) already fixed for every other
 * screen in this console. Porting them here would have reintroduced a known, already-fixed defect
 * into a freshly-merged screen; every calendar screen below calls `formatDateStamp`/`formatClockTime`/
 * `formatAbsolute` from `time/format.ts` instead - see each screen for how.
 *
 * What *is* ported: `weekdayNames`, `slotStatusLabel`, `renderCustomer`, `renderPhone` - genuinely
 * calendar-specific vocabulary with no equivalent anywhere else in this console.
 */

/** The seven-day enumeration the Setup screen's working-hours form and the worker-slots table both
 * need, keyed off the same `ConsoleStrings` fields so the two can never drift apart. */
export function weekdayNames(strings: ConsoleStrings): string[] {
  return [
    strings.calendarWeekdaySunday,
    strings.calendarWeekdayMonday,
    strings.calendarWeekdayTuesday,
    strings.calendarWeekdayWednesday,
    strings.calendarWeekdayThursday,
    strings.calendarWeekdayFriday,
    strings.calendarWeekdaySaturday,
  ];
}

/** `WorkerSlot.status`'s six wire values, mapped to this locale's own chrome - a fixed server enum
 * counts as chrome the same way `ago-console`'s own `outcomeConverted`/`outcomeUnset` do. The
 * worker-recut screen shows a narrower, three-value subset on its own booking rows; that union is
 * assignable to this wider parameter type, so the one switch serves both screens. */
export function slotStatusLabel(status: WorkerSlot["status"], strings: ConsoleStrings): string {
  switch (status) {
    case "Available":
      return strings.calendarSlotStatusAvailable;
    case "PendingConfirmation":
      return strings.calendarSlotStatusPendingConfirmation;
    case "Booked":
      return strings.calendarSlotStatusBooked;
    case "Cancelled":
      return strings.calendarSlotStatusCancelled;
    case "NoShow":
      return strings.calendarSlotStatusNoShow;
    case "Blocked":
      return strings.calendarSlotStatusBlocked;
  }
}

/** No customer at all (a free or blocked slot) reads as a plain dash - never confusable with
 * "hidden", which only ever means "somebody holds this and I may not see who" (`renderPhone`'s own
 * remarks give the full two-state story). */
export function renderCustomer(
  slot: { customerId: string | null; customerDisplayName: string | null },
  strings: ConsoleStrings,
) {
  if (slot.customerId === null) {
    return <span className="ago-meta">—</span>;
  }

  if (slot.customerDisplayName === null) {
    return (
      <span className="ago-meta" title={strings.calendarHiddenContactTooltip}>
        {strings.calendarHiddenContactLabel}
      </span>
    );
  }

  return slot.customerDisplayName;
}

/**
 * `23-30`: which row's own Reveal is currently in flight (`ContactDetailsPanel`'s `revealingId`, the
 * identical shape) and the callback a click fires - built once per page, keyed on `customerId` rather
 * than a row id, because a reveal is per customer (`revealCustomerPhone`'s own parameter), not per
 * booking or slot: two rows for the same customer reveal, and stay revealed, together.
 */
export interface RevealControl {
  revealingCustomerId: string | null;
  onReveal: (customerId: string) => void;
}

/**
 * `20-12`'s own rule, restated for a screen that - unlike the pending queue - has rows with no
 * customer at all: `phone === null` is ambiguous by itself (no customer, or a customer this operator
 * may not see), and `customerId` is what tells the two apart. Rendering "hidden" for a genuinely free
 * slot would be a lie; rendering a blank dash for a withheld one would be indistinguishable from "no
 * phone recorded", which cannot happen (`Ago.Calendar.Domain.Customer.Phone` is never nullable).
 *
 * `23-30`/`23-12`: a third, orthogonal state layered on top of those two - `masked`, never inferred
 * from the string's own shape. A row with a non-null, masked phone gets a Reveal button beside the
 * masked value; nothing here computes or holds the real number before `onReveal`'s own server round
 * trip resolves (`revealCustomerPhone`'s own doc comment) - the same "never unmasked client-side"
 * discipline `ContactDetailsPanel.handleReveal` already established for chat's own contact details.
 */
export function renderPhone(
  slot: { customerId: string | null; phone: string | null; masked: boolean },
  strings: ConsoleStrings,
  reveal: RevealControl,
) {
  if (slot.customerId === null) {
    return <span className="ago-meta">—</span>;
  }

  if (slot.phone === null) {
    return (
      <span className="ago-meta" title={strings.calendarHiddenContactTooltip}>
        {strings.calendarHiddenContactLabel}
      </span>
    );
  }

  if (!slot.masked) {
    return slot.phone;
  }

  const customerId = slot.customerId;
  const revealing = reveal.revealingCustomerId === customerId;

  return (
    <span className="ago-row">
      <span>{slot.phone}</span>
      <Button size="sm" variant="secondary" disabled={revealing} onClick={() => reveal.onReveal(customerId)}>
        {revealing ? strings.calendarRevealingPhoneButton : strings.calendarRevealPhoneButton}
      </Button>
    </span>
  );
}

/**
 * `25-16`: the eleven time zones of the Russian Federation (fixed since the 2014 return to permanent
 * standard time - `24-17` in `ago-calendar` already settled that none of this deployment's zones
 * observe DST, so "the offset" and "the current offset" are the same reading for every zone below,
 * permanently). This is the "reasonably short and relevant" set the item calls for: a Russian-market
 * chat/calendar product's tenants are realistically choosing among these eleven, not the full IANA
 * database of hundreds. One canonical IANA id per federal offset - tzdata's own primary alias for
 * that offset (`Asia/Krasnoyarsk`, not `Asia/Novosibirsk`, which currently shares its +07:00 but has
 * its own DST *history* and so its own zone entry) - with `Europe`/`Asia` and the city name each
 * translated by hand rather than through `Intl.DisplayNames`: verified live against this project's
 * own Node runtime, `new Intl.DisplayNames(["ru"], { type: "timeZone" })` throws
 * `RangeError: Value timeZone out of range for Intl.DisplayNames options property type` - `"timeZone"`
 * has never been a valid `Intl.DisplayNames` type per ECMA-402, so the localized-city-name half of
 * this item cannot come from that API at all, confirming the item's own warning to check live rather
 * than assume. A curated translation map is the other option the item names, and is what this is.
 */
const CURATED_TIME_ZONES: readonly {
  zone: string;
  continent: { en: string; ru: string };
  city: { en: string; ru: string };
}[] = [
  { zone: "Europe/Kaliningrad", continent: { en: "Europe", ru: "Европа" }, city: { en: "Kaliningrad", ru: "Калининград" } },
  { zone: "Europe/Moscow", continent: { en: "Europe", ru: "Европа" }, city: { en: "Moscow", ru: "Москва" } },
  { zone: "Europe/Samara", continent: { en: "Europe", ru: "Европа" }, city: { en: "Samara", ru: "Самара" } },
  { zone: "Asia/Yekaterinburg", continent: { en: "Asia", ru: "Азия" }, city: { en: "Yekaterinburg", ru: "Екатеринбург" } },
  { zone: "Asia/Omsk", continent: { en: "Asia", ru: "Азия" }, city: { en: "Omsk", ru: "Омск" } },
  { zone: "Asia/Krasnoyarsk", continent: { en: "Asia", ru: "Азия" }, city: { en: "Krasnoyarsk", ru: "Красноярск" } },
  { zone: "Asia/Irkutsk", continent: { en: "Asia", ru: "Азия" }, city: { en: "Irkutsk", ru: "Иркутск" } },
  { zone: "Asia/Yakutsk", continent: { en: "Asia", ru: "Азия" }, city: { en: "Yakutsk", ru: "Якутск" } },
  { zone: "Asia/Vladivostok", continent: { en: "Asia", ru: "Азия" }, city: { en: "Vladivostok", ru: "Владивосток" } },
  { zone: "Asia/Magadan", continent: { en: "Asia", ru: "Азия" }, city: { en: "Magadan", ru: "Магадан" } },
  { zone: "Asia/Kamchatka", continent: { en: "Asia", ru: "Азия" }, city: { en: "Kamchatka", ru: "Камчатка" } },
];

/**
 * Reads `zone`'s current UTC offset live through `Intl.DateTimeFormat`'s own `timeZoneName:
 * "shortOffset"` (`"GMT+3"`, `"GMT+5:30"`, or bare `"GMT"` for UTC itself) and reshapes it into the
 * fixed-width `"+HH:MM"` the item's own spec asks for - never a value stored or hand-computed here,
 * so a zone whose offset changes stays correct without this file being touched again. Guarded rather
 * than left to throw: a saved-but-unresolvable zone id must still render *a* label, the same
 * "must never be the reason something fails to render" posture `time/format.ts`'s `resolveTimeZone`
 * already takes for the browser's own ambient zone.
 */
function zoneOffsetLabel(zone: string, dateIntlLocale: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat(dateIntlLocale, { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(now);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /^GMT([+-]\d{1,2})(?::(\d{2}))?$/.exec(raw);
    if (match === null) {
      return "+00:00"; // bare "GMT" (UTC itself) or a shape this regex does not expect
    }
    const sign = match[1].startsWith("-") ? "-" : "+";
    const hours = String(Math.abs(Number(match[1]))).padStart(2, "0");
    const minutes = match[2] ?? "00";
    return `${sign}${hours}:${minutes}`;
  } catch {
    return "+00:00"; // an id Intl cannot resolve at all - still renders, never throws through to the page
  }
}

export interface TimeZoneOption {
  value: string;
  label: string;
}

/**
 * `25-16`: the calendar setup screen's own timezone picker. The curated eleven above, each shown
 * translated into `strings`' own language and offset-labelled live, plus - the item's own "an
 * existing site's stored zone id must still resolve to a selectable option" requirement -
 * `selectedZone` appended when it is not already one of the eleven, so a site configured against a
 * zone outside this list (a legacy value, or one entered by hand before this item) never loses its
 * setting on the next visit to this screen. An unlisted zone has no curated translation to show, so
 * it falls back to its own raw IANA id rather than guessing one - still selectable, still
 * offset-labelled live, just not translated.
 */
export function timeZoneOptions(strings: ConsoleStrings, selectedZone: string): TimeZoneOption[] {
  const lang: "en" | "ru" = strings.dateIntlLocale.startsWith("ru") ? "ru" : "en";
  const options = CURATED_TIME_ZONES.map((entry) => ({
    value: entry.zone,
    label: `${entry.continent[lang]}/${entry.city[lang]} (${zoneOffsetLabel(entry.zone, strings.dateIntlLocale)})`,
  }));

  if (!options.some((option) => option.value === selectedZone)) {
    options.push({ value: selectedZone, label: `${selectedZone} (${zoneOffsetLabel(selectedZone, strings.dateIntlLocale)})` });
  }

  return options;
}
