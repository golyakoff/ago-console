import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, type AppShellNavSection } from "./AppShell.js";
import { render, unmount, one } from "../testing/dom.js";

vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

/**
 * `25-51`: `AppShell`/`NavSections` render a per-item `badge` mechanically - it never decides what a
 * number means, only where it goes (`consoleNav.ts` resolves the count and the accessible text; these
 * tests build `AppShellNavSection[]` by hand, the same "caller-built sections, no live connection"
 * shape `appShellErrorBoundary.test.tsx` already uses). Three claims from the item's own Done-when,
 * proved at the DOM level rather than by reading the code:
 *
 * - a badge is drawn on the item itself while its own section is open, and moves to the section
 *   header once that section is collapsed - never both at once;
 * - the mobile hamburger's own overlay badge is the *sum* of every item's badge across every
 *   section, always - proving it is derived from the identical `sections` array the rail/drawer
 *   render from, never a third, independent count.
 */
const TALK_ITEM_BADGE = { count: 5, label: "unread messages" };
const CALENDAR_ITEM_BADGE = { count: 3, label: "bookings awaiting confirmation" };

function sections(): AppShellNavSection[] {
  return [
    {
      id: "talk",
      label: "Диалоги",
      items: [{ to: "/", label: "Мои", end: true, badge: TALK_ITEM_BADGE }],
    },
    {
      id: "calendar",
      label: "Записи",
      items: [{ to: "/calendar/waiting", label: "В ожидании", end: true, badge: CALENDAR_ITEM_BADGE }],
    },
  ];
}

afterEach(async () => {
  await unmount();
});

describe("nav badges - item vs. collapsed-section placement", () => {
  it("draws the badge on the item itself while its own section is the open one", async () => {
    // `/` matches only the talk section's own item, so `AppShell`'s own `activeSectionId` opens
    // "talk" and leaves "calendar" collapsed - the same route-driven accordion state every other
    // shell test in this file relies on.
    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={sections()}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );

    // Scoped to the desktop rail - `AppShell` also renders the identical `NavSections` a second time
    // inside the (closed) mobile drawer, and the header's own hamburger button carries its own
    // `aria-expanded` too (`navBadges.test.tsx`'s own overlay tests exercise that one), so an
    // unscoped query risks matching any of the three.
    const rail = one<HTMLElement>(container, ".ago-shell__rail");
    const myItem = one<HTMLAnchorElement>(rail, 'a[href="/"]');
    const itemBadge = myItem.querySelector(".ago-badge--danger");
    expect(itemBadge?.textContent).toContain("5");
    expect(itemBadge?.textContent).toContain(TALK_ITEM_BADGE.label);

    // The open section's own header button carries no badge of its own - the number is already
    // shown once, on the item beneath it.
    const talkHeader = one<HTMLButtonElement>(rail, 'button[aria-expanded="true"]');
    expect(talkHeader.textContent).toContain("Диалоги");
    expect(talkHeader.querySelector(".ago-badge--danger")).toBeNull();
  });

  it("moves the badge to the section's own header once that section is collapsed", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={sections()}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );

    // "Записи" (calendar) is collapsed at "/" - its own item ("В ожидании") is not even in the DOM
    // (`NavSections`'s own `{isOpen && ...}`), so the only place the count "3" can be is the header.
    // Scoped to the rail - see the previous test's own remarks on why an unscoped query is ambiguous.
    const rail = one<HTMLElement>(container, ".ago-shell__rail");
    const calendarHeader = one<HTMLButtonElement>(rail, 'button[aria-expanded="false"]');
    expect(calendarHeader.textContent).toContain("Записи");
    const headerBadge = calendarHeader.querySelector(".ago-badge--danger");
    expect(headerBadge?.textContent).toContain("3");
    expect(headerBadge?.textContent).toContain(CALENDAR_ITEM_BADGE.label);

    // And the item itself genuinely is not rendered at all while collapsed - not merely hidden.
    expect(container.querySelector('a[href="/calendar/waiting"]')).toBeNull();
  });

  it("draws no badge at all on a section header with nothing to report, even collapsed", async () => {
    const bare: AppShellNavSection[] = [
      { id: "talk", label: "Диалоги", items: [{ to: "/", label: "Мои", end: true }] },
      { id: "team", label: "Команда", items: [{ to: "/team/chat", label: "Общение" }] },
    ];

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={bare}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );

    const rail = one<HTMLElement>(container, ".ago-shell__rail");
    const teamHeader = one<HTMLButtonElement>(rail, 'button[aria-expanded="false"]');
    expect(teamHeader.textContent).toContain("Команда");
    expect(teamHeader.querySelector(".ago-badge--danger")).toBeNull();
  });
});

describe("nav badges - the mobile hamburger's own derived sum", () => {
  it("sums every section's own badge - never a third, independently-tracked count", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={sections()}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );

    const menuButton = one<HTMLButtonElement>(container, ".ago-shell__menu-button");
    const overlay = menuButton.querySelector(".ago-shell__menu-badge");
    expect(overlay?.textContent).toBe(String(TALK_ITEM_BADGE.count + CALENDAR_ITEM_BADGE.count));
    // Accessible even though the visible overlay is `aria-hidden` - folded into the button's own
    // `aria-label` instead, so a screen-reader user is told the identical fact a sighted one sees.
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(menuButton.getAttribute("aria-label")).toContain("8");
  });

  it("draws no overlay at all when every section's own badge is zero or absent", async () => {
    const zeroed: AppShellNavSection[] = [{ id: "talk", label: "Диалоги", items: [{ to: "/", label: "Мои", end: true }] }];

    const container = await render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell sections={zeroed}>
          <div />
        </AppShell>
      </MemoryRouter>,
    );

    const menuButton = one<HTMLButtonElement>(container, ".ago-shell__menu-button");
    expect(menuButton.querySelector(".ago-shell__menu-badge")).toBeNull();
  });
});
