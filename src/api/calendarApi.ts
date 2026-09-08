import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * Every call the six calendar screens make, in one file - moved unchanged from
 * `ago-calendar-console`'s own `src/api/calendarApi.ts` (`22-06`, `adr/0093`): the console merges,
 * `Ago.Calendar.Api` does not, so this file's own wire contract is untouched by the move.
 *
 * <b>Plain `fetch`, no generated client</b> - matching this console's own `api/*.ts` shape, the same
 * one `faqKnowledgeBaseApi.ts` already established for a second product's own backend. Field names
 * match `Ago.Calendar.Contracts`' C# records verbatim under ASP.NET Core's default camelCase policy.
 *
 * <b>The tenant is never in a path, a body or a query string</b> - and since `22-14`/`adr/0100` it is
 * named, once, in the `X-Ago-Active-Site` request header `send()` attaches below. That is not the
 * thing the older wording here warned against. A console that could put a tenant id in a URL would be
 * one whose every route had to be re-checked; what this sends is a *choice among tenancies the server
 * already knows this person holds* - `RoleAssignmentProjectionStore.ResolveTenantAsync` answers only
 * out of that operator's own projection rows, so the header can narrow which tenant a request acts in
 * and can never widen it. Without it, a person granted the calendar on two accounts resolves to no
 * tenant at all and every screen in this section is simply absent (`22-14`'s own defect).
 *
 * <b>The access token is a parameter, never a module-level capture.</b> Silent renewal replaces it
 * on its own schedule (`auth/userManager.ts`), so a captured token is a token that goes stale -
 * `ago-console` shipped that defect once (`5-16`) and this is the shape that cannot.
 *
 * <b>`config.calendarApiBaseUrl` can be `null`</b> - unlike the source console, where
 * `config.apiBaseUrl` was required and the whole app failed to boot without it, this console has
 * other screens that do not depend on AGO Calendar at all. `requireBaseUrl()` below is
 * `faqKnowledgeBaseApi.ts`'s own `requireBaseUrl` pattern, reused rather than reinvented: every
 * exported call throws the identical `CalendarApiError` shape a failed HTTP call already produces, so
 * the pages' existing `err instanceof CalendarApiError` handling covers "never configured" for free.
 */

export interface WorkingHoursRule {
  ruleId: string;
  workerId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export interface ConfiguredCalendar {
  calendarId: string;
  name: string;
  timeZone: string;
  isPublished: boolean;
  workerIds: string[];
  workingHours: WorkingHoursRule[];
}

export interface ConfiguredWorker {
  workerId: string;
  displayName: string;
  isActive: boolean;
  serviceIds: string[];
}

/**
 * `20-13`: one worker, in full - the workers table's own row shape and the edit card's prefill, in
 * one response so the console never needs a second request to open a card for a worker it has
 * already listed. Field names match `Ago.Calendar.Contracts.WorkerResponse` verbatim.
 */
export interface WorkerDetail {
  workerId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  displayName: string;
  /** Whether a human typed `displayName` directly - see `Worker.DisplayNameIsCustom`'s own remarks.
   * While this is `false`, editing the last or first name keeps recomputing the display name; the
   * moment it is `true`, nothing recomputes it again. */
  displayNameIsCustom: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * `20-14`: a worker's own schedule template. `kind` is the wire string `"Weekly"` or `"Cycle"` -
 * mirrors `Ago.Calendar.Domain.ScheduleKind`'s own names, chosen over the numeric enum ordinal
 * `System.Text.Json` would otherwise serialise a bare C# enum as. The five `cycle*` fields are
 * populated only while `kind === "Cycle"`; `null` while `kind === "Weekly"`, the same
 * populated-only-for-the-active-kind shape the server's own aggregate carries.
 */
export interface WorkerSchedule {
  scheduleId: string;
  workerId: string;
  kind: "Weekly" | "Cycle";
  cycleAnchor: string | null;
  cycleWorkingDays: number | null;
  cycleRestDays: number | null;
  cycleStartsAt: string | null;
  cycleEndsAt: string | null;
  slotMinutes: number;
  bufferMinutes: number;
  horizonDays: number;
  materializeFrom: string;
  createdAt: string;
  updatedAt: string;
  /**
   * `20-18`: whether a multi-slot booking's own internal buffers count toward satisfying a
   * service's duration, or only toward the run's physical span - see
   * `Ago.Calendar.Domain.WorkerSchedule.BuffersCountTowardServiceDuration`'s own remarks for the
   * arithmetic this decides between. Defaults `true` server-side.
   */
  buffersCountTowardServiceDuration: boolean;
}

/**
 * `23-35`: a service has a price and a description, or it deliberately does not - both are `null`
 * exactly when the tenant has stated neither, never an empty string or a zero standing in for
 * "unset". Field names match `Ago.Calendar.Contracts.ConfiguredServiceResponse` verbatim.
 */
export interface ConfiguredService {
  serviceId: string;
  name: string;
  durationMinutes: number;
  /** Kopecks, or `null` when the tenant has stated no price. */
  priceMinorUnits: number | null;
  /** `null` exactly when `priceMinorUnits` is - stated rather than assumed, even though the server
   * only ever writes `"RUB"` today. */
  priceCurrencyCode: string | null;
  /** True means the amount is a floor, not the guaranteed final price ("what does a price mean when
   * the real cost depends on the master or takes longer than usual") - the console renders it with an
   * "от" ("from") prefix exactly when this is true. Meaningless while `priceMinorUnits` is `null`. */
  priceIsFrom: boolean;
  /** Freeform marketing copy the tenant maintains, or `null` for none. */
  description: string | null;
}

export interface TenantConfiguration {
  tenantName: string;
  /** What the shop pastes into its own page's script tag. Shown only here - the console is the only
   * place it ever appears. */
  publicKey: string;
  allowedOrigins: string[];
  calendars: ConfiguredCalendar[];
  workers: ConfiguredWorker[];
  services: ConfiguredService[];
}

/**
 * `23-23`: `Ago.Calendar.Application.UseCases.Configuration.BookingPrecondition`'s wire name,
 * verbatim - the six things `flows.md` 3.1 names, in the stable order the server always returns
 * them in. A union of literals rather than `string`, so a switch over every case here is exhaustive
 * at compile time the moment a seventh precondition is ever added server-side.
 */
export type BookingPrecondition =
  | "CalendarPublished"
  | "WorkerOnCalendar"
  | "ServiceOffered"
  | "WorkingHoursConfigured"
  | "ScheduleSaved"
  | "SlotsMaterialized";

export interface PreconditionState {
  precondition: BookingPrecondition;
  isMet: boolean;
}

/** `23-23`: one entry per calendar the tenant has created, plus the placeholder entry the server
 * returns for a tenant with none - `calendarId`/`calendarName` are `null` exactly then, the only
 * state that null carries. */
export interface CalendarReadiness {
  calendarId: string | null;
  calendarName: string | null;
  isBookable: boolean;
  preconditions: PreconditionState[];
}

export interface PendingBooking {
  bookingId: string;
  calendarId: string;
  workerId: string;
  serviceId: string;
  customerId: string;
  startsAt: string;
  endsAt: string;
  localDate: string;
  confirmationDeadline: string;
  /** The sweep's health, on the one screen a human already looks at (`20-04`). A row that shows this
   * means the confirmation sweep is not doing its job, and the customer has already been told they
   * are booked. */
  isOverdue: boolean;
  /**
   * `20-12`. `null` means exactly one thing: this operator does not hold `customer:read` in this
   * tenant, so the server never joined to `customers` at all - never "no phone recorded", which
   * cannot happen (`Ago.Calendar.Domain.Customer.Phone` is not nullable). `QueuePage` renders that
   * one state as "hidden, not absent" rather than as an empty cell indistinguishable from either
   * reading.
   */
  phone: string | null;
  /** `23-30`/`23-12`: whether `phone` above is the tenant's own rung-masked display form, rather
   * than the real number - meaningful only when `phone` is non-null. `CalendarQueuePage` renders a
   * Reveal control exactly when this is `true`, never inferring it from the string's own shape
   * (`Ago.Calendar.Contracts.PendingBookingResponse.Masked`'s own remarks). */
  masked: boolean;
}

/**
 * `23-34`: one confirmed booking - an appointment, not a slot. Field names match
 * `Ago.Calendar.Contracts.ConfirmedBookingResponse` verbatim.
 *
 * Unlike `PendingBooking.phone` above and `WorkerSlot.phone`/`customerDisplayName` below, neither
 * `phone` nor `customerDisplayName` here carries a "this operator lacks the permission" null state -
 * `Ago.Calendar.Application.UseCases.ConfirmedBookings.GetConfirmedBookingsForTenantHandler` gates the
 * whole list on `customer:read` rather than joining conditionally, because the item's own scope names
 * the customer as a required column of this screen, not an optional bonus one (see that handler's own
 * doc comment). `phone` is therefore always a string - masked or real - and `customerDisplayName` is
 * `null` only when the customer has never had a name recorded, unrelated to any permission.
 */
export interface ConfirmedBooking {
  bookingId: string;
  calendarId: string;
  workerId: string;
  workerDisplayName: string;
  serviceId: string;
  serviceName: string | null;
  customerId: string;
  customerDisplayName: string | null;
  startsAt: string;
  endsAt: string;
  localDate: string;
  /** 0 = Sunday, matching `WorkerSlot.weekday`'s own convention - computed server-side from
   * `localDate` for the identical reason that field's own comment gives. */
  weekday: number;
  phone: string;
  masked: boolean;
}

/**
 * `23-99`: `CalendarBookingsPage`'s own render already tells "loading" (`groups === null`, a
 * `Skeleton`) apart from "genuinely nothing booked" (`groups !== null && groups.length === 0`, a
 * `Panel` with `calendarBookingsEmpty`) - but only for a response that actually arrived shaped the
 * way `ConfirmedBooking` promises. A row silently missing one of these keys (a dropped
 * `workerDisplayName`, say) would group into the same two states without ever tripping either
 * branch, or `groupByDayThenWorker`'s own `.find`/property reads. Every key here is required
 * (`RequiredKeys<ConfirmedBooking>` excludes none of them - none of this DTO's fields are optional on
 * the wire, only nullable), so this is the full field list; see `shapeGuard.ts`'s own doc comment for
 * why TypeScript, not a second hand-maintained list, is what keeps it that way.
 */
const confirmedBookingRequiredKeys = requiredKeysOf<ConfirmedBooking>({
  bookingId: true,
  calendarId: true,
  workerId: true,
  workerDisplayName: true,
  serviceId: true,
  serviceName: true,
  customerId: true,
  customerDisplayName: true,
  startsAt: true,
  endsAt: true,
  localDate: true,
  weekday: true,
  phone: true,
  masked: true,
});

// `22-06`: `Role`/`OperatorInfo` and the six `getRoles`/`createRole`/`getOperators`/
// `inviteOperator`/`grantOperatorRole`/`revokeOperatorRole` functions that returned/consumed them
// were removed here, not carried over - `22-05` (`adr/0093`, merged into `ago-calendar` mid-move)
// deleted the calendar's own `operators`/`roles` tables and every console endpoint that managed
// them (`ConsoleEndpoints.cs` on `ago-calendar`'s own `origin/main`: "there is no longer a
// calendar-owned `operators`/`roles` table to manage"). A client for an endpoint that returns 404
// on every call is not a smaller version of this file, it is dead code with a compiling signature.

/**
 * `20-15`: one row of a worker's materialised schedule - whatever it currently is, not just what is
 * occupied. Field names match `Ago.Calendar.Contracts.WorkerSlotResponse` verbatim.
 */
export interface WorkerSlot {
  eventId: string;
  localDate: string;
  /** 0 = Sunday, matching `Date.prototype.getDay()` and `System.DayOfWeek` alike - derived
   * server-side from `localDate`, never from this browser's own zone. */
  weekday: number;
  startsAt: string;
  endsAt: string;
  status: "Available" | "PendingConfirmation" | "Booked" | "Cancelled" | "NoShow" | "Blocked";
  serviceId: string | null;
  /** Null on a `Blocked` row - a closure is not a service. */
  serviceName: string | null;
  /**
   * `20-15`. Not personal data - a foreign key - so never gated, unlike `customerDisplayName`/
   * `phone` below. What tells their two null-reasons apart: null here means nobody holds the slot;
   * non-null with those two null means somebody does and this operator may not see who.
   */
  customerId: string | null;
  /** `20-12`'s own gate, reused. See `customerId` for how its own two null-reasons are told apart. */
  customerDisplayName: string | null;
  phone: string | null;
  /** `23-30`/`23-12`: whether `phone` is the tenant's own rung-masked display form - meaningful
   * only when `phone` is non-null, the identical convention `PendingBooking.masked` and
   * `ConfirmedBooking.masked` already carry. */
  masked: boolean;
  /**
   * `20-18`: which booking this slot belongs to, null exactly when `status` is `"Available"` or
   * `"Blocked"`. Two rows sharing this value are two slots of one multi-slot booking - this is what
   * lets `WorkerSlotsPage` show them as the same booking without merging the rows themselves (a slot
   * is still one row with one status).
   */
  bookingId: string | null;
}

/**
 * `20-16`: one booking a re-cut found inside `[from, horizon]` for a worker. Field names match
 * `Ago.Calendar.Contracts.RecutBookingPreviewResponse` verbatim.
 */
export interface RecutBookingPreview {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  /** Never anything but `PendingConfirmation`, `Booked` or `NoShow` - see `IEventRepository` for why
   * those three, and no other status, hold a customer. */
  status: "PendingConfirmation" | "Booked" | "NoShow";
  serviceId: string | null;
  serviceName: string | null;
  /** `20-12`'s own gate, reused a third time (`WorkerSlot.customerId` and `PendingBooking`'s own
   * field are the other two) - never gated, a foreign key rather than personal data. */
  customerId: string | null;
  customerDisplayName: string | null;
  phone: string | null;
  /** `23-30`/`23-12`: whether `phone` is the tenant's own rung-masked display form - the identical
   * convention every other calendar response row carrying a phone now uses. */
  masked: boolean;
  /**
   * `false` only for a `NoShow` row: a visit that already happened cannot be cancelled through the
   * ordinary cancellation use case, so the console offers no cancel/keep control for it at all - its
   * day is always going to be skipped, and the copy says so rather than showing a control that would
   * do nothing.
   */
  canDecide: boolean;
}

/** `20-16`. One business-local day a re-cut would act on - including a day with nothing on it at
 * all, since that day is still going to be freshly cut. */
export interface RecutDayPreview {
  localDate: string;
  availableSlotsToDelete: number;
  bookings: RecutBookingPreview[];
}

/** `20-16`. `fingerprint` is opaque - hand it back unchanged to `recutSchedule`, which refuses the
 * whole request if the booking set it names has changed since this preview was read. */
export interface RecutPreviewResult {
  days: RecutDayPreview[];
  fingerprint: string;
}

export interface RecutResult {
  recutDays: string[];
  skippedDays: string[];
  slotsDeleted: number;
  slotsInserted: number;
  bookingsCancelled: number;
}

/**
 * `23-30`/`23-12`: `phone` is always populated - masked or real, never absent, because every row on
 * this report already passed `customer:read` the same way `ConfirmedBooking.phone`'s own remarks
 * describe. `masked` tells the two apart; the console must not infer it from the string's own shape.
 */
export interface Contact {
  customerId: string;
  phone: string;
  masked: boolean;
  displayName: string | null;
  notes: string | null;
  /** Always zero today - nothing in this product writes it yet (`20-04`'s own retro note). Shown
   * honestly rather than hidden, so the report does not imply a feature that does not exist. */
  noShowCount: number;
  /** `20-09`'s own fact: when this number was proven reachable by an SMS code, or `null` if it never
   * has been. */
  phoneVerifiedAt: string | null;
  /** `23-12`'s own distinct fact: when an operator recorded "I called and it is them", or `null` if
   * nobody has. Never merged with `phoneVerifiedAt` - `decisions.md` §5: "'I called and it is them'
   * is a different fact from an SMS code", so `CalendarContactsPage` renders the two as visibly
   * different badges rather than one generic "verified" state. */
  phoneConfirmedByOperatorAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** `23-30`/`23-12`'s own audit view - one reveal, individually, never an aggregated count
 * (`decisions.md` §5's amendment: "reveal counts belong in an audit view, never in the report a
 * person is judged on" - and even here, never a per-operator tally this page could be read as
 * ranking staff by). Field names match `Ago.Calendar.Contracts.ContactPhoneRevealResponse`
 * verbatim. */
export interface PhoneReveal {
  id: string;
  occurredAt: string;
  customerId: string;
  operatorId: string;
  surface: string;
}

/** `NextBefore` is the keyset cursor for the next page, `null` once the oldest row has been
 * reached - the same shape `searchConversations`' own `nextBeforeMessageId` already carries. */
export interface PhoneRevealPage {
  items: PhoneReveal[];
  nextBefore: string | null;
}

/**
 * Carries the server's stable problem-details `type` alongside its human-readable `detail` -
 * `api-design.md`: "clients branch on `type`, never on the message". This console branches on
 * `configuration.forbidden` (to say *why* a screen is empty rather than showing an empty screen) and
 * renders `message` verbatim for everything else, so a rejection this file has never heard of still
 * reaches the operator worded as the server worded it.
 */
export class CalendarApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CalendarApiError";
    this.code = code;
    this.status = status;
  }
}

/** `faqKnowledgeBaseApi.ts`'s own `requireBaseUrl` pattern - see this file's own header. */
function requireBaseUrl(): string {
  if (config.calendarApiBaseUrl === null) {
    throw new CalendarApiError(
      "Calendar.NotConfigured",
      "The calendar backend is not configured for this deployment yet.",
      0,
    );
  }

  return config.calendarApiBaseUrl;
}

const base = () => `${requireBaseUrl()}/api/v1/console`;

export function getConfiguration(token: string, signal?: AbortSignal): Promise<TenantConfiguration> {
  return request<TenantConfiguration>(token, "GET", "/configuration", undefined, signal);
}

export function setAllowedOrigins(token: string, origins: string[]): Promise<void> {
  return requestVoid(token, "PUT", "/configuration/allowed-origins", { origins });
}

/** `23-23`: "can this tenant take a booking right now, and if not, which precondition is unmet" -
 * `CalendarSetupPage` and `CalendarWorkersPage` both call this alongside `getConfiguration`. */
export function getBookingReadiness(token: string, signal?: AbortSignal): Promise<CalendarReadiness[]> {
  return request<CalendarReadiness[]>(token, "GET", "/booking-readiness", undefined, signal);
}

export function createCalendar(
  token: string,
  body: { name: string; timeZone: string; publish: boolean },
): Promise<{ calendarId: string }> {
  return request<{ calendarId: string }>(token, "POST", "/calendars", body);
}

export function updateCalendar(
  token: string,
  calendarId: string,
  body: { name: string; publish: boolean },
): Promise<void> {
  return requestVoid(token, "PUT", `/calendars/${encodeURIComponent(calendarId)}`, body);
}

/**
 * `23-35`. `priceMinorUnits`/`priceIsFrom`/`description` are all optional - `undefined` (never sent)
 * behaves exactly like the server's own `null` default, so a caller creating a service with neither a
 * price nor a description needs no extra ceremony. No currency field: v1 accepts exactly one, chosen
 * server-side (`Ago.Calendar.Domain.Money`'s own remarks say why).
 */
export function createService(
  token: string,
  body: {
    name: string;
    durationMinutes: number;
    priceMinorUnits?: number | null;
    priceIsFrom?: boolean;
    description?: string | null;
  },
): Promise<{ serviceId: string }> {
  return request<{ serviceId: string }>(token, "POST", "/services", body);
}

/** `20-13`. `middleName`/`displayName` are `null` when the console never touched that field - see
 * `WorkerDetail.displayNameIsCustom`'s own remarks for what a non-null `displayName` does server
 * side. */
export function createWorker(
  token: string,
  body: {
    lastName: string;
    firstName: string;
    middleName: string | null;
    displayName: string | null;
    calendarId: string;
    serviceIds: string[];
  },
): Promise<{ workerId: string }> {
  return request<{ workerId: string }>(token, "POST", "/workers", body);
}

export function listWorkers(token: string, signal?: AbortSignal): Promise<WorkerDetail[]> {
  return request<WorkerDetail[]>(token, "GET", "/workers", undefined, signal);
}

export function getWorker(token: string, workerId: string, signal?: AbortSignal): Promise<WorkerDetail> {
  return request<WorkerDetail>(token, "GET", `/workers/${encodeURIComponent(workerId)}`, undefined, signal);
}

export function updateWorker(
  token: string,
  workerId: string,
  body: {
    lastName: string;
    firstName: string;
    middleName: string | null;
    displayName: string | null;
    isActive: boolean;
  },
): Promise<void> {
  return requestVoid(token, "PUT", `/workers/${encodeURIComponent(workerId)}`, body);
}

export function deleteWorker(token: string, workerId: string): Promise<void> {
  return requestVoid(token, "DELETE", `/workers/${encodeURIComponent(workerId)}`);
}

/** `20-14`. Rejects with `configuration.no_schedule` when the worker has none yet - the console
 * renders that as the "create a schedule" form rather than as an error. */
export function getWorkerSchedule(token: string, workerId: string, signal?: AbortSignal): Promise<WorkerSchedule> {
  return request<WorkerSchedule>(token, "GET", `/workers/${encodeURIComponent(workerId)}/schedule`, undefined, signal);
}

/** `20-14`. Create-or-replace: the same call whether the worker has no schedule yet or already has
 * one - see `WorkerSchedule`'s own remarks on the wire shape. */
export function saveWorkerSchedule(
  token: string,
  workerId: string,
  body: {
    kind: "Weekly" | "Cycle";
    cycleAnchor: string | null;
    cycleWorkingDays: number | null;
    cycleRestDays: number | null;
    cycleStartsAt: string | null;
    cycleEndsAt: string | null;
    slotMinutes: number;
    bufferMinutes: number;
    horizonDays: number;
    materializeFrom: string;
    buffersCountTowardServiceDuration: boolean;
  },
): Promise<WorkerSchedule> {
  return request<WorkerSchedule>(token, "PUT", `/workers/${encodeURIComponent(workerId)}/schedule`, body);
}

export function addWorkingHoursRule(
  token: string,
  body: { calendarId: string; workerId: string; dayOfWeek: number; startsAt: string; endsAt: string },
): Promise<{ ruleId: string }> {
  return request<{ ruleId: string }>(token, "POST", "/working-hours", body);
}

export function getPendingBookings(token: string, signal?: AbortSignal): Promise<PendingBooking[]> {
  return request<PendingBooking[]>(token, "GET", "/pending-bookings", undefined, signal);
}

/** `23-34`. `from`/`to` are `YYYY-MM-DD`, business-local, both inclusive - the identical shape
 * `getWorkerSlots` already uses for its own date-range parameters. */
export function getConfirmedBookings(
  token: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<ConfirmedBooking[]> {
  const query = new URLSearchParams({ from, to });
  return request<ConfirmedBooking[]>(token, "GET", `/confirmed-bookings?${query.toString()}`, undefined, signal, (value) => {
    assertArrayHasKeys<ConfirmedBooking>(value, confirmedBookingRequiredKeys, "GET /confirmed-bookings");
  });
}

/** The queue's own verb. Confirmation is what happens when nobody acts, so the operator-facing
 * action is *reject* - the queue is a veto list, not an approval list (`20-04`). */
export function rejectBooking(token: string, bookingId: string): Promise<void> {
  return requestVoid(token, "POST", `/bookings/${encodeURIComponent(bookingId)}/reject`);
}

export function cancelBooking(token: string, bookingId: string): Promise<void> {
  return requestVoid(token, "POST", `/bookings/${encodeURIComponent(bookingId)}/cancel`);
}

export function markNoShow(token: string, bookingId: string): Promise<void> {
  return requestVoid(token, "POST", `/bookings/${encodeURIComponent(bookingId)}/no-show`);
}

export function deleteDayOff(
  token: string,
  body: { calendarId: string; workerId: string; localDate: string },
): Promise<void> {
  return requestVoid(token, "POST", "/availability/day-off", body);
}

export function editDayBoundary(
  token: string,
  body: { calendarId: string; workerId: string; localDate: string; opensAt: string; closesAt: string },
): Promise<void> {
  return requestVoid(token, "POST", "/availability/day-boundary", body);
}

export function getContacts(token: string, signal?: AbortSignal): Promise<Contact[]> {
  return request<Contact[]>(token, "GET", "/contacts", undefined, signal);
}

/**
 * `23-30`/`23-12`: `POST /contacts/{id}/reveal-phone` - one customer, one reveal, gated server-side
 * on `customer:read` (the same permission the list reads already need). Returns the real number and
 * nothing else (`Ago.Calendar.Contracts.CustomerPhoneRevealResponse`); the four calendar screens
 * replace the masked row with this response rather than computing anything client-side, the identical
 * shape `ago-chat`'s own `revealContactDetail` already established (`ContactDetailsPanel`'s own doc
 * comment).
 *
 * `surface` names which screen asked, for the reveal record's own "which surface" field - a plain
 * string, not a closed union: `RevealCustomerPhoneRequest.Surface` is stored and read back verbatim
 * by `getPhoneReveals` below, with no server-side vocabulary to stay in step with.
 */
export function revealCustomerPhone(token: string, customerId: string, surface: string): Promise<{ phone: string }> {
  return request<{ phone: string }>(
    token, "POST", `/contacts/${encodeURIComponent(customerId)}/reveal-phone`, { surface },
  );
}

/**
 * `23-30`/`23-12`: `GET /contacts/phone-reveals` - the audit trail, gated server-side on
 * `calendar:configure` rather than `customer:read`, deliberately wider than the reveal action itself
 * (`GetPhoneRevealsForTenantHandler`'s own doc comment: revealing one number does not entitle
 * somebody to the whole tenant's reveal history). `before`/`limit` are the keyset page this list
 * already returns server-side - `before` is the last `id` from the previous page, `undefined` for the
 * first one.
 */
export function getPhoneReveals(
  token: string,
  before?: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<PhoneRevealPage> {
  const query = new URLSearchParams();
  if (before !== undefined) {
    query.set("before", before);
  }
  if (limit !== undefined) {
    query.set("limit", String(limit));
  }
  const suffix = query.toString();
  return request<PhoneRevealPage>(token, "GET", `/contacts/phone-reveals${suffix ? `?${suffix}` : ""}`, undefined, signal);
}

/** `20-15`. `from`/`to` are `YYYY-MM-DD`, business-local, both inclusive. */
export function getWorkerSlots(
  token: string,
  workerId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<WorkerSlot[]> {
  const query = new URLSearchParams({ from, to });
  return request<WorkerSlot[]>(
    token, "GET", `/workers/${encodeURIComponent(workerId)}/slots?${query.toString()}`, undefined, signal,
  );
}

/**
 * `20-16`: shows what a re-cut back to `from` would destroy, before it destroys anything. Read-only -
 * nothing is written until `recutSchedule` is called with the `fingerprint` this returns.
 */
export function previewRecutSchedule(
  token: string,
  workerId: string,
  from: string,
  signal?: AbortSignal,
): Promise<RecutPreviewResult> {
  return request<RecutPreviewResult>(
    token, "POST", `/workers/${encodeURIComponent(workerId)}/schedule/recut/preview`, { from }, signal,
  );
}

/**
 * `20-16`. `fingerprint` must be the exact value the preview this decision set is based on returned -
 * the server refuses the whole request (`recut.stale`) if the bookings in range changed since. One
 * entry in `decisions` per booking the preview showed with `canDecide: true`; a `NoShow` row needs
 * none and always forces its day to be skipped.
 */
export function recutSchedule(
  token: string,
  workerId: string,
  body: { from: string; fingerprint: string; decisions: { bookingId: string; decision: "Cancel" | "Keep" }[] },
): Promise<RecutResult> {
  return request<RecutResult>(token, "POST", `/workers/${encodeURIComponent(workerId)}/schedule/recut`, body);
}

/**
 * `23-99`: `validate` is an opt-in fifth parameter, not a change to every call this function already
 * makes - the item's own chosen reading is validation only where an absent field would otherwise
 * look like an empty list or count, not a schema for every response (that is reading 3, explicitly
 * out of scope). A caller that passes one gets a `CalendarApiError("shape.mismatch", ...)` in place
 * of `ShapeMismatchError` thrown - the same type, and the same `catch`, every other rejection from
 * this file already produces, so `calendarErrorMessage`'s existing fallthrough (an unrecognised code
 * renders `reason.message` verbatim) covers it for free rather than needing a sixth error type.
 */
async function request<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  validate?: (value: unknown) => asserts value is T,
): Promise<T> {
  const response = await send(token, method, path, body, signal);
  const parsed: unknown = await response.json();
  if (validate) {
    try {
      validate(parsed);
    } catch (reason) {
      if (reason instanceof ShapeMismatchError) {
        throw new CalendarApiError("shape.mismatch", reason.message, response.status);
      }
      throw reason;
    }
  }
  return parsed as T;
}

async function requestVoid(token: string, method: string, path: string, body?: unknown): Promise<void> {
  await send(token, method, path, body);
}

async function send(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(`${base()}${path}`, {
    method,
    // `22-14`/`adr/0100`: the one chokepoint every calendar call goes through, so the active-site
    // header is added once rather than at thirty call sites. Same header, same value, same singleton
    // (`api/activeSite.ts`) the chat backend's own calls already carry - `Ago.Calendar.Api`'s
    // `TenantId` *is* `Ago.Chat.Api`'s `SiteId` (`RoleAssignmentsChangedConsumer` maps one onto the
    // other), so a second name for the same choice would be one more thing to keep in step.
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Accept: "application/json",
    }),
    body: body === undefined ? null : JSON.stringify(body),
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw await problemFrom(response);
  }

  return response;
}

async function problemFrom(response: Response): Promise<CalendarApiError> {
  // A 401 has no problem-details body worth parsing: it is the framework refusing before any of this
  // product's code ran, so it gets its own sentence rather than an empty one.
  if (response.status === 401) {
    return new CalendarApiError("auth.unauthenticated", "Your session has expired. Sign in again.", 401);
  }

  try {
    const problem = (await response.json()) as { type?: unknown; detail?: unknown };
    return new CalendarApiError(
      typeof problem.type === "string" ? problem.type : `http.${response.status}`,
      typeof problem.detail === "string" ? problem.detail : `The request failed (${String(response.status)}).`,
      response.status,
    );
  } catch {
    return new CalendarApiError(`http.${response.status}`, `The request failed (${String(response.status)}).`, response.status);
  }
}
