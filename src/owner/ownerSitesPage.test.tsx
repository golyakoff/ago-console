import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSitesPage } from "./OwnerSitesPage.js";
import type { OwnerSiteSummary } from "../api/ownerApi.js";
import { all, byText, flush, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `4-06`(console): found live - a platform owner who also holds an operator seat lost the whole
 * console nav (Conversations, the site-scoped screens) the moment they opened "Platform sites",
 * because this page built its own single-item nav ("Back to the console") instead of the same list
 * `OperatorShell` builds. `consoleNav.ts`'s `buildTenantNavItems` is now shared between the two -
 * this file is the `OwnerSitesPage` half of proving it, mirroring `permissionGating.test.tsx`'s own
 * setup for `OperatorShell`.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ fetchOwnerSites: vi.fn(), probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "owner-sub", preferred_username: "golyakoff" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function shellAt() {
  return (
    <MemoryRouter initialEntries={["/owner"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner" element={<OwnerSitesPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

/** `23-24`: reads only `.ago-shell__nav-link-label`, not the whole link's `textContent` - a muted
 * entry also carries `NavLockGlyph`'s own visually-hidden label right beside it
 * (`AppShell.tsx`'s own doc comment, `permissionGating.test.tsx`'s own identical helper). */
function navLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__nav a").map(
    (link) => (link.querySelector(".ago-shell__nav-link-label")?.textContent ?? "").trim(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ownerApi.fetchOwnerSites.mockResolvedValue({
    status: "ok",
    page: { sites: [], nextBefore: null, recentWindowDays: 30, matchingSites: 0, totalSites: 0 },
  });
});

afterEach(async () => {
  await unmount();
});

describe("the platform-sites page's own navigation", () => {
  it("offers the same console sections OperatorShell would, for an owner who also holds an operator seat", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Demo Shop One" }] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(shellAt());

    expect(navLabels(container)).toEqual([
      "Conversations",
      "All conversations",
      "Search",
      "Analytics",
      "Conversion",
      "Tag report",
      "Booking flow",
      "Install widget",
      "Widget appearance",
      "AI FAQ assistant",
      "Offline auto-reply",
      "Canned responses",
      "Tags",
      "Billing",
      "Delete account",
      "Platform sites",
    ]);
  });

  it("offers only Platform sites for an owner with no operator seat at all", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    expect(navLabels(container)).toEqual(["Platform sites"]);
  });

  it("marks Platform sites as the active link, since this page is what it points at", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    const link = all(container, ".ago-shell__nav a").find((a) => (a.textContent ?? "").trim() === "Platform sites");
    expect(link?.classList.contains("ago-shell__nav-link--active")).toBe(true);
  });

  /** Found live, 2026-08-27: this page's own site table had the identical reading-width gap
   * `OperatorShell`'s tenant-management tabs did - a table is not prose. */
  it("renders in the shell's full width, not the reading-width one", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    expect(container.querySelector(".ago-shell__main")?.classList.contains("ago-shell__main--wide")).toBe(true);
  });

  /** Found live, 2026-08-29: this page passes `wide` alone (no internal scroll region of its own -
   * its content is a site table, and `.ago-table-scroll` only scrolls horizontally), so it must not
   * pick up the fixed-height, `overflow: hidden` shell mode `wide` used to carry along with it before
   * `AppShell.tsx` split `wide` and `fixed` into independent props - that combination is what clipped
   * this table's own overflow with no scrollbar, on any site list longer than a screen. */
  it("stays page-scrollable - it has no internal scroll region of its own", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    expect(container.querySelector(".ago-shell")?.classList.contains("ago-shell--fixed")).toBe(false);
    expect(container.querySelector(".ago-shell__main")?.classList.contains("ago-shell__main--fixed")).toBe(false);
  });
});

describe("the platform-sites page's own table", () => {
  /** Found live, 2026-08-28: the identical bug `AdminConversationsPage` had (fixed the same day,
   * `permissionGating.test.tsx`'s own "does not nest the table inside a second Panel card") -
   * `.ago-table-scroll` (rendered by `Table`) already carries its own complete card (border, radius,
   * background), so wrapping it in a titled `Panel` nested a second card inside the first, and the
   * outer one's padding was the "extra white container" around the table. `Panel`'s title and
   * description moved into `PageHead` instead of being dropped. */
  it("does not nest the table inside a second Panel card", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
    ownerApi.fetchOwnerSites.mockResolvedValue({
      status: "ok",
      page: {
        sites: [
          {
            siteId: SITE_ID,
            name: "Demo Shop One",
            tier: "free",
            createdAt: "2026-01-01T00:00:00Z",
            seatCount: 2,
            conversationCount: 5,
            recentMessageCount: 10,
            lastMessageAt: "2026-08-27T00:00:00Z",
            attachmentBytes: 1024,
          },
        ],
        nextBefore: null,
        recentWindowDays: 30,
        matchingSites: 1,
        totalSites: 1,
      },
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Platform sites");
    expect(container.textContent).toContain("Message volume and last activity cover");
    expect(container.querySelector(".ago-panel")).toBeNull();
  });

  /** `23-14`'s own Done-when: a row leads to the per-tenant detail read - the drill-down
   * `ui-inventory.md` §8.1 recorded as absent. */
  it("links each row to its own detail route", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
    ownerApi.fetchOwnerSites.mockResolvedValue({
      status: "ok",
      page: { sites: [oneSite()], nextBefore: null, recentWindowDays: 30, matchingSites: 1, totalSites: 1 },
    });

    const container = await render(shellAt());

    const link = one<HTMLAnchorElement>(container, `a[href="/owner/sites/${SITE_ID}"]`);
    expect(link.textContent).toContain("Demo Shop One");
  });
});

// React swallows a direct `.value` assignment as "no change" (it patches the native setter to track
// what it last rendered); the prototype's own setter is what makes the synthetic `input` event real -
// the same workaround `SearchConversationsPage.test.tsx`'s own `search` helper uses.
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function search(container: HTMLElement, query: string) {
  const input = one<HTMLInputElement>(container, 'input[type="text"]');
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await interact(() => byText<HTMLButtonElement>(container, "button", "Search").click());
}

function oneSite(overrides: Partial<OwnerSiteSummary> = {}): OwnerSiteSummary {
  return {
    siteId: SITE_ID,
    name: "Demo Shop One",
    tier: "free",
    createdAt: "2026-01-01T00:00:00Z",
    seatCount: 2,
    conversationCount: 5,
    recentMessageCount: 10,
    lastMessageAt: "2026-08-27T00:00:00Z",
    attachmentBytes: 1024,
    ...overrides,
  };
}

describe("the platform-sites page's own search", () => {
  beforeEach(() => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
  });

  /** The guard the item's own author asked for by name: a search result must say how many of how
   * many, never a bare row count that reads like the whole platform. */
  it("submitting a search sends the query and shows the match summary the server reported", async () => {
    ownerApi.fetchOwnerSites.mockResolvedValueOnce({
      status: "ok",
      page: { sites: [], nextBefore: null, recentWindowDays: 30, matchingSites: 0, totalSites: 41 },
    });

    const container = await render(shellAt());
    await flush();

    ownerApi.fetchOwnerSites.mockResolvedValueOnce({
      status: "ok",
      page: { sites: [oneSite()], nextBefore: null, recentWindowDays: 30, matchingSites: 3, totalSites: 41 },
    });

    await search(container, "Bakery");

    expect(ownerApi.fetchOwnerSites).toHaveBeenLastCalledWith("token", undefined, "Bakery");
    expect(container.textContent).toContain("3 of 41 sites match.");
  });

  /** A search matching nothing must still name the true total - never read like the platform has
   * zero tenants. */
  it("a search matching nothing still names the real total, not a bare empty state", async () => {
    ownerApi.fetchOwnerSites.mockResolvedValueOnce({
      status: "ok",
      page: { sites: [oneSite()], nextBefore: null, recentWindowDays: 30, matchingSites: 1, totalSites: 41 },
    });

    const container = await render(shellAt());
    await flush();

    ownerApi.fetchOwnerSites.mockResolvedValueOnce({
      status: "ok",
      page: { sites: [], nextBefore: null, recentWindowDays: 30, matchingSites: 0, totalSites: 41 },
    });

    await search(container, "no-such-tenant");

    expect(container.textContent).toContain("0 of 41 sites match.");
  });

  it("an unfiltered load shows no match-summary line - the row count already says it plainer", async () => {
    ownerApi.fetchOwnerSites.mockResolvedValue({
      status: "ok",
      page: { sites: [oneSite()], nextBefore: null, recentWindowDays: 30, matchingSites: 41, totalSites: 41 },
    });

    const container = await render(shellAt());

    expect(container.textContent).not.toContain("of 41 sites match");
  });
});
