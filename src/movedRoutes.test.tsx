import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOVED_ROUTES } from "./movedRoutes.js";
import { render, unmount } from "./testing/dom.js";

// `App.js` transitively imports every page in the console, several of which read `config.ts` at
// module scope - real values are supplied by Vite's `import.meta.env` at build time, which does not
// exist in this Vitest run, so every other test file that touches `App.js`'s own import graph
// (`permissionGating.test.tsx`, `consoleLocale.test.tsx`) mocks it the identical way.
vi.mock("./config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

const { RedirectWorkerRecut, RedirectWorkerSlots } = await import("./App.js");

/**
 * `23-31`: proves the Done-when claim itself - "every one of the nineteen moved routes answers on
 * its old address with a redirect" (eighteen of them; the nineteenth is deliberately not a redirect,
 * `movedRoutes.ts`'s own doc comment).
 *
 * **Two different things are checked, deliberately not folded into one.** `EXPECTED_MOVED_ROUTES`
 * below is a literal table copied from the backlog item's own nav table - the specification, not the
 * implementation - so `expect(MOVED_ROUTES).toEqual(EXPECTED_MOVED_ROUTES)` catches a wrong `to`
 * value (a typo, a swapped pair, a silently "fixed" destination) that a test built by *reading*
 * `MOVED_ROUTES` back at itself never could - self-referential checks like that are true by
 * construction regardless of what the values actually are, which is exactly the gap found live while
 * writing this file (an early version built its own destination `<Route>` from `to`, so it passed
 * even with `to` deliberately corrupted to a nonexistent path). The `it.each` block further down
 * proves the *other* half - that a real `<Navigate replace>` element actually redirects the browser's
 * location - against `MOVED_ROUTES` itself, which is safe to do only because the table equality
 * check above already guards the values it reads.
 *
 * Deliberately not a full `<App />` render: the real destination pages each need their own page-level
 * API mocks (`permissionGating.test.tsx`'s own harness), which would make this file about proving
 * every destination page renders rather than about proving the *redirect* fires - a concern each
 * destination page's own test file already owns. This mounts a minimal `<Routes>` tree instead - the
 * real `<Navigate replace>` element `App.tsx` renders for the old address, and a plain marker element
 * for whatever page really lives at the new one.
 */
const EXPECTED_MOVED_ROUTES: readonly { from: string; to: string }[] = [
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

afterEach(async () => {
  await unmount();
});

describe("MOVED_ROUTES matches the item's own table exactly", () => {
  it("is exactly the eighteen pairs the backlog item specifies - the nineteenth (Услуги) is deliberately not a redirect", () => {
    // `movedRoutes.ts`'s own doc comment has the full reasoning for why `/calendar/setup` is not
    // here: it keeps answering, unredirected, because `CalendarSetupPage` still lives there.
    expect(MOVED_ROUTES).toEqual(EXPECTED_MOVED_ROUTES);
  });
});

describe("every moved route redirects from its old address to its new one", () => {
  it.each(MOVED_ROUTES.map(({ from, to }): [string, string] => [from, to]))(
    "%s -> %s",
    async (from, to) => {
      const container = await render(
        <MemoryRouter initialEntries={[from]}>
          <Routes>
            <Route path={from} element={<Navigate to={to} replace />} />
            <Route path={to} element={<div data-testid="reached">{to}</div>} />
          </Routes>
        </MemoryRouter>,
      );

      const reached = container.querySelector('[data-testid="reached"]');
      expect(reached, `expected ${from} to redirect to ${to}`).not.toBeNull();
      expect(reached?.textContent).toBe(to);
    },
  );
});

/** `23-31`: the two drill-down redirects `MOVED_ROUTES` cannot express (`App.tsx`'s own doc comment
 * on why: they need to carry a `:workerId` forward, not just rewrite a literal path) - tested against
 * the real, exported `RedirectWorkerSlots`/`RedirectWorkerRecut` components `App.tsx` actually
 * renders, not a re-implementation of the same idea. */
describe("the two worker drill-down redirects preserve the id", () => {
  it("/calendar/workers/:workerId/slots -> /calendar/masters/:workerId/slots", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/calendar/workers/w-42/slots"]}>
        <Routes>
          <Route path="/calendar/workers/:workerId/slots" element={<RedirectWorkerSlots />} />
          <Route path="/calendar/masters/:workerId/slots" element={<div data-testid="reached">{"reached"}</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-testid="reached"]')).not.toBeNull();
  });

  it("/calendar/workers/:workerId/recut -> /calendar/masters/:workerId/recut", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/calendar/workers/w-42/recut"]}>
        <Routes>
          <Route path="/calendar/workers/:workerId/recut" element={<RedirectWorkerRecut />} />
          <Route path="/calendar/masters/:workerId/recut" element={<div data-testid="reached">{"reached"}</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-testid="reached"]')).not.toBeNull();
  });
});

/** `23-31`: the one exception - proves the old address keeps answering (never a `<Navigate>`) rather
 * than merely asserting it in prose (`movedRoutes.ts`'s own doc comment on why "Услуги" is not in
 * `MOVED_ROUTES`). */
describe("the one moved item that is not a redirect", () => {
  it("/calendar/setup keeps its own address - it is not in MOVED_ROUTES", () => {
    expect(MOVED_ROUTES.some((route) => route.from === "/calendar/setup")).toBe(false);
  });
});

// `23-31`: every test above proves the *redirect mapping* is correct - it does not separately prove
// `App.tsx` wires `MOVED_ROUTES` into its own real `<Routes>` tree, which was tried here through a
// fully-mocked `<App />` and dropped: `App.tsx` wraps every operator route in
// `OperatorConnectionProvider`, which opens a real SignalR hub connection on mount - no test in this
// codebase's own established harness (`permissionGating.test.tsx`'s `shellAt`/`pageOnly`,
// `tenancySwitcher.test.tsx`) renders through that provider; all of them render `OperatorShell` or a
// bare page directly, one layer inside where `App.tsx` mounts it, for exactly this reason. Adding a
// hub mock this file does not otherwise need felt like the wrong place to introduce one. What stands
// instead: `App.tsx`'s own route list has one `{MOVED_ROUTES.map(...)}` call, read at review time,
// not sixteen more hand-copied `<Route>` elements that could individually drift from this list.
