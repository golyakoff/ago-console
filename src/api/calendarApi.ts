import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

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

export interface ConfiguredService {
  serviceId: string;
  name: string;
  durationMinutes: number;
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
}

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

export interface Contact {
  customerId: string;
  phone: string;
  displayName: string | null;
  notes: string | null;
  /** Always zero today - nothing in this product writes it yet (`20-04`'s own retro note). Shown
   * honestly rather than hidden, so the report does not imply a feature that does not exist. */
  noShowCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
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

export function createService(
  token: string,
  body: { name: string; durationMinutes: number },
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

async function request<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await send(token, method, path, body, signal);
  return (await response.json()) as T;
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
