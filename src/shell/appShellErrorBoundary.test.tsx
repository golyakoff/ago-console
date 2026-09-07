import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, CenteredShell, type AppShellNavSection } from "./AppShell.js";
import { render, unmount } from "../testing/dom.js";

vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

/**
 * `23-41`. The concrete Done-when this item names: "A component that throws during render no
 * longer blanks the whole console - asserted by a test that throws on purpose."
 *
 * `Bomb` here stands in for `CalendarElsewhereNotice`'s `tenancy.tenantName.trim()` - a component
 * deep inside a page's own content, reading a field the type system promised and the server did not
 * send. Before this item, a real render like this one unmounted the *entire* React tree (a blank
 * `<body>`, `docs/backlog/23-41-*.md`'s own account). This asserts the two things that changed:
 * the console does not blank, and the nav/header furniture around the broken screen survives -
 * which is `AppShell`'s own mount point (`RenderErrorBoundary.tsx`'s doc comment), not
 * `OperatorShell`'s (that one is `operatorShellErrorBoundary.test.tsx`).
 */
function Bomb(): never {
  throw new Error("Bomb: thrown on purpose by a test");
}

const SECTIONS: AppShellNavSection[] = [
  { id: "conversations", label: "Диалоги", items: [{ to: "/", label: "Мои", end: true }] },
];

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("the render-error boundary at AppShell's own mount point", () => {
  it("does not blank the console when a page component throws during render", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={SECTIONS}>
          <Bomb />
        </AppShell>
      </MemoryRouter>,
    );

    // Not blank: `document.body` (via `container`) still has real, non-empty content - the failure
    // this item is about is exactly a `<body>` with nothing in it.
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("keeps the navigation and header usable - only the broken screen's own content is replaced", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={SECTIONS}>
          <Bomb />
        </AppShell>
      </MemoryRouter>,
    );

    // The nav rail and its section survive - this is what "a boundary per route, under the shell"
    // (the item's own reading 2) means: the frame around the broken content stays.
    expect(container.querySelector(".ago-shell__rail")).not.toBeNull();
    expect(container.textContent).toContain("Диалоги");
    // The header/brand furniture survives too.
    expect(container.querySelector(".ago-shell__header")).not.toBeNull();
  });

  it("tells the viewer something true and actionable, with a real retry control", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={SECTIONS}>
          <Bomb />
        </AppShell>
      </MemoryRouter>,
    );

    // `Alert tone="danger"` carries `role="alert"` - screen-reader-announced, the same live-region
    // guarantee every fetch-error `<Alert>` in the console already has.
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Try again");
    // A retry control is offered, not just an inert message - scoped to the alert itself, since
    // `AppShell`'s own hamburger menu button is also a `<button>` on the page.
    expect(alert?.querySelector("button")?.textContent).toContain("Try again");
  });

  it("is visually distinguishable from an empty state - the failure this item exists to end", async () => {
    // `20-30`'s own Done-when: "an empty state that would look identical if the account did not
    // exist" is the thing to refuse. This asserts the error fallback uses the danger `Alert`
    // vocabulary (`role="alert"`, `.ago-alert--danger`) rather than the empty-state vocabulary
    // (`Panel` + a bare `<p className="ago-meta">`) `23-34`'s bookings screen established - the two
    // must never render as the same shape.
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={SECTIONS}>
          <Bomb />
        </AppShell>
      </MemoryRouter>,
    );

    expect(container.querySelector(".ago-alert--danger")).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("catches the identical throw when the page uses CenteredShell instead of AppShell", async () => {
    // `CallbackPage`'s own shell - the second of `RenderErrorBoundary`'s three mount points, proved
    // separately because `CenteredShell` is a distinct component, not a thin wrapper over `AppShell`.
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <CenteredShell>
        <Bomb />
      </CenteredShell>,
    );

    expect(container.querySelector(".ago-alert--danger")).not.toBeNull();
    expect(container.querySelector(".ago-shell__header")).not.toBeNull();
  });
});
