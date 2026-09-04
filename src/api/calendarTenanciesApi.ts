import { config } from "../config.js";
import { CalendarApiError } from "./calendarApi.js";

/**
 * `22-14`/`adr/0100`: `GET /api/v1/me/tenancies` on `Ago.Calendar.Api` - which shops this identity
 * holds calendar permissions in, according to the calendar's own database.
 *
 * <b>Why this is not `tenanciesApi.ts`.</b> That one asks `Ago.Chat.Api` the same-shaped question and
 * is what the shop picker in the shell is built from; the values are even the same ids (`adr/0093`
 * unified tenancy; `RoleAssignmentsChangedConsumer` maps a `SiteId` straight onto a `TenantId`). They
 * are still different answers: chat lists every shop this person administers, and a shop only has a
 * calendar once the module is enabled for it and the grant has been replicated across the broker.
 * Asking chat "where is my calendar" would be guessing on the calendar's behalf, and getting it wrong
 * is exactly this item's own defect wearing different clothes.
 *
 * <b>No active-site header.</b> This is the one calendar call that must answer for the identity
 * rather than for a tenant - the server derives the operator id from the token's own `sub` and takes
 * no tenant at all - so sending the current choice could only mislead a reader into thinking it
 * scoped something. Kept out of `calendarApi.ts` for that reason as much as for its route being
 * outside `/api/v1/console`.
 */
export interface CalendarTenancy {
  tenantId: string;
  /** Possibly the empty string - the calendar knows a grant for a tenant whose own row it has not
   * been provisioned yet. Callers render their own fallback, exactly as the shell's existing shop
   * picker already does for a site with a blank name. */
  tenantName: string;
}

interface TenanciesBody {
  tenancies: CalendarTenancy[];
}

/**
 * Throws `CalendarApiError`, the same type every other calendar call throws - including for "the
 * calendar backend is not configured for this deployment", which is why `requireBaseUrl`'s shape is
 * repeated here rather than imported: a caller already has one `catch` for that type, and giving this
 * one call a second error type would be a second thing every caller had to learn.
 */
export async function fetchMyCalendarTenancies(
  token: string,
  signal?: AbortSignal,
): Promise<CalendarTenancy[]> {
  if (config.calendarApiBaseUrl === null) {
    throw new CalendarApiError(
      "Calendar.NotConfigured",
      "The calendar backend is not configured for this deployment yet.",
      0,
    );
  }

  const response = await fetch(`${config.calendarApiBaseUrl}/api/v1/me/tenancies`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw new CalendarApiError(
      `http.${String(response.status)}`,
      `Could not load your calendar tenancies (${String(response.status)}).`,
      response.status,
    );
  }

  return ((await response.json()) as TenanciesBody).tenancies;
}
