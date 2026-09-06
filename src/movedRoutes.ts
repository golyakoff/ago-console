/**
 * `23-31`: the eighteen genuine dead-address redirects `App.tsx` renders - pulled out to its own
 * module, rather than left as eighteen inline `<Route>` elements, so `movedRoutes.test.tsx` can
 * import the exact same list `App.tsx` renders from and prove each one really redirects, instead of
 * a second, hand-copied table that could quietly drift from the routes it is supposed to be testing.
 *
 * **Eighteen, not nineteen.** The item's own table names nineteen moved routes; the nineteenth
 * (`/calendar/setup` -> `/calendar/services`, "Услуги") is not a redirect at all - `App.tsx`'s own
 * doc comment on its `<Route path="/calendar/setup">` has the full reasoning: that old address keeps
 * answering, unredirected, because `CalendarSetupPage` still lives there.
 *
 * Two more redirects exist beside this list (`RedirectWorkerSlots`/`RedirectWorkerRecut` in
 * `App.tsx`) but are not in it - both need to read a `:workerId` param and re-interpolate it into the
 * new address, which a `{from, to}` pair with two literal strings cannot express.
 */
export interface MovedRoute {
  from: string;
  to: string;
}

export const MOVED_ROUTES: readonly MovedRoute[] = [
  { from: "/admin", to: "/conversations/all" },
  { from: "/search", to: "/conversations/search" },
  { from: "/analytics", to: "/analytics/site" },
  { from: "/settings/install", to: "/channels/install" },
  { from: "/settings/widget", to: "/channels/widget" },
  { from: "/settings/faq", to: "/automation/faq" },
  { from: "/settings/auto-reply", to: "/automation/auto-reply" },
  { from: "/settings/canned-responses", to: "/automation/canned" },
  { from: "/settings/tags", to: "/automation/tags" },
  { from: "/settings/billing", to: "/account/billing" },
  { from: "/settings/device-storage", to: "/account/device-storage" },
  { from: "/settings/products", to: "/account/products" },
  { from: "/settings/delete-account", to: "/account/delete" },
  { from: "/settings/operators", to: "/team/people" },
  { from: "/calendar", to: "/calendar/waiting" },
  { from: "/calendar/workers", to: "/calendar/masters" },
  { from: "/calendar/availability", to: "/calendar/schedule" },
  { from: "/calendar/contacts", to: "/calendar/clients" },
];
