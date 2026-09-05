import type { Page, Route } from "@playwright/test";
import {
  CALENDAR_WORKER_ID,
  SITE_ID,
  OPEN_CONVERSATION_ID,
  seededAllConversations,
  seededAnalytics,
  seededCalendarBookingReadiness,
  seededCalendarConfiguration,
  seededCalendarContacts,
  seededCalendarPendingBookings,
  seededCalendarWorkers,
  seededCalendarWorkerSlots,
  seededOperatorTeam,
  seededOwnerSitesPage,
  seededPermissions,
  seededQueue,
  seededSeatAssignmentSummary,
  seededTenancies,
  seededVisitorHistory,
  seededWidgetConfig,
  type SeededPermissionsOverrides,
} from "./data.js";

/**
 * `15-11`'s "seeded/stubbed data, not a live backend": every plain-`fetch` REST call the console's
 * chosen screens make, answered from one route handler rather than a real `Ago.Chat.Api`. There is
 * no backend running in CI (or in this worktree) - `page.route` intercepts before the request ever
 * reaches the network, so the app cannot tell the difference from the inside.
 *
 * Matched by `pathname` and `method` only, deliberately ignoring the query string (`tag=`,
 * `beforeId=`, `from=`/`to=`) - every screen this gate opens fetches its first, unfiltered page, and
 * a gate whose fixtures had to track every filter combination a screen *could* ask for would be
 * fixture-maintenance the mechanical check does not need in order to answer "does this render
 * usably". A screen that later grows a filter this gate exercises can extend this router without
 * touching the assertions themselves.
 *
 * One handler per distinct pathname *shape* (a literal path, or a path with a `:param` segment)
 * rather than one `page.route` call per endpoint - Playwright evaluates routes in registration order
 * and the app's own `URL` already gives this file a real `pathname` to switch on, which reads more
 * plainly than five overlapping glob patterns would.
 */
export async function installApiStubs(page: Page, permissionsOverride?: SeededPermissionsOverrides): Promise<void> {
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/v1/me/tenancies" && method === "GET") {
      return json(seededTenancies());
    }

    if (path === "/api/v1/operators/me" && method === "GET") {
      // `23-24`: `undefined` for every screen but the one that overrides it
      // (`screens.ts`'s own `admin-limited-permissions`) - `seededPermissions()`'s own default
      // parameter falls back to the fully-permissioned operator every other screen in this gate
      // relies on, unchanged.
      return json(seededPermissions(permissionsOverride));
    }

    if (path === "/api/v1/conversations/queue" && method === "GET") {
      return json(seededQueue());
    }

    if (path === "/api/v1/conversations/all" && method === "GET") {
      return json(seededAllConversations());
    }

    if (path === "/api/v1/conversations/analytics" && method === "GET") {
      return json(seededAnalytics());
    }

    if (path === `/api/v1/conversations/${OPEN_CONVERSATION_ID}/visitor-history` && method === "GET") {
      return json(seededVisitorHistory());
    }

    if (path === `/api/v1/conversations/${OPEN_CONVERSATION_ID}/read` && method === "POST") {
      return json({ operatorUnreadCount: 0, operatorLastReadSequence: 4 });
    }

    // Both wrapped, not bare arrays - `cannedResponsesApi.ts#fetchCannedResponses` reads
    // `body.responses`, `tagsApi.ts#fetchTags` reads `body.tags`; a bare `[]` here made both crash
    // with "Cannot read properties of undefined (reading 'length')" the first time this gate ran
    // against `/admin` - found by decoding the production build's own source map back to
    // `AdminConversationsPage.tsx:247` (`{tags.length > 0 && ...}`), not by inspection alone.
    if (path === `/api/v1/sites/${SITE_ID}/canned-responses` && method === "GET") {
      return json({ responses: [] });
    }

    if (path === `/api/v1/sites/${SITE_ID}/tags` && method === "GET") {
      return json({ tags: [] });
    }

    if (path === `/api/v1/sites/${SITE_ID}/widget-config` && method === "GET") {
      return json(seededWidgetConfig());
    }

    if (path === "/api/v1/owner/sites" && method === "GET") {
      return json(seededOwnerSitesPage());
    }

    // `23-22`: the team screen's own two reads - `GetOperatorTeamHandler` (new) and
    // `GetSeatAssignmentSummaryHandler` (`13-03`, unchanged). Exact-string matched like every other
    // handler in this file, so `.../operators` never accidentally matches
    // `.../operators/seat-assignment-summary`'s longer path or vice versa.
    if (path === `/api/v1/sites/${SITE_ID}/operators` && method === "GET") {
      return json(seededOperatorTeam());
    }

    if (path === `/api/v1/sites/${SITE_ID}/operators/seat-assignment-summary` && method === "GET") {
      return json(seededSeatAssignmentSummary());
    }

    // `22-06`/`adr/0093`: `Ago.Calendar.Api`'s own `/api/v1/console/*` shape
    // (`src/api/calendarApi.ts`) - same-origin here too, since `.env.ux-gate` points
    // `VITE_CALENDAR_API_BASE_URL` at this identical `127.0.0.1:4173` origin for the identical
    // same-origin-fixture reason `gateEnv.ts`'s own doc comment gives for `VITE_API_BASE_URL`. No
    // path here collides with `Ago.Chat.Api`'s own shapes above - `/console/*` is a prefix `ago-chat`
    // never uses.
    if (path === "/api/v1/console/pending-bookings" && method === "GET") {
      return json(seededCalendarPendingBookings());
    }

    if (path === "/api/v1/console/workers" && method === "GET") {
      return json(seededCalendarWorkers());
    }

    if (path === "/api/v1/console/configuration" && method === "GET") {
      return json(seededCalendarConfiguration());
    }

    // `23-23`: the readiness panel both calendar screens render alongside their own data above.
    if (path === "/api/v1/console/booking-readiness" && method === "GET") {
      return json(seededCalendarBookingReadiness());
    }

    if (path === "/api/v1/console/contacts" && method === "GET") {
      return json(seededCalendarContacts());
    }

    // `15-16` (`ago-root#397`): `CalendarWorkerSlotsPage`'s own call, matched on the seeded worker id
    // and ignoring the query string like every other handler in this file (`from`/`to` here) - the
    // page always fetches its own default two-week range computed from the *real* `new Date()`, not
    // a fixture-controlled clock, so a handler keyed on the query would have to track a value this
    // file cannot predict. `CalendarWorkerRecutPage`, this gate's other new screen, needs no handler
    // at all - see `ux-gate/fixtures/screens.ts`'s own doc comment for why.
    if (path === `/api/v1/console/workers/${CALENDAR_WORKER_ID}/slots` && method === "GET") {
      return json(seededCalendarWorkerSlots());
    }

    // Anything this gate's chosen screens do not need (billing, offline auto-reply, attachments,
    // erasure polling...) gets a bland, well-formed empty/failure answer rather than hanging the
    // request forever - a screen that unexpectedly depends on one of these would otherwise time out
    // opaquely instead of failing fast with a visible 404 in the trace.
    return route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ type: "UxGate.NotStubbed", detail: `${method} ${path} has no ux-gate fixture` }) });
  });
}
