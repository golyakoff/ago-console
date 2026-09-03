import type { ConsoleStrings } from "../i18n/strings.js";
import type { WorkerSlot } from "../api/calendarApi.js";

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
 * `20-12`'s own rule, restated for a screen that - unlike the pending queue - has rows with no
 * customer at all: `phone === null` is ambiguous by itself (no customer, or a customer this operator
 * may not see), and `customerId` is what tells the two apart. Rendering "hidden" for a genuinely free
 * slot would be a lie; rendering a blank dash for a withheld one would be indistinguishable from "no
 * phone recorded", which cannot happen (`Ago.Calendar.Domain.Customer.Phone` is never nullable).
 */
export function renderPhone(slot: { customerId: string | null; phone: string | null }, strings: ConsoleStrings) {
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

  return slot.phone;
}
