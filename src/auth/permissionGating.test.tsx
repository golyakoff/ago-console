import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "./AuthContext.js";
import { PermissionsProvider } from "./PermissionsProvider.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { AdminConversationsPage } from "../pages/AdminConversationsPage.js";
import { WidgetConfigPage } from "../pages/WidgetConfigPage.js";
import { InstallSnippetPage } from "../pages/InstallSnippetPage.js";
import { OfflineAutoReplyPage } from "../pages/OfflineAutoReplyPage.js";
import { CannedResponsesPage } from "../pages/CannedResponsesPage.js";
import { FaqModulePage } from "../pages/FaqModulePage.js";
import { CalendarQueuePage } from "../pages/CalendarQueuePage.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-08`: **an operator without a permission is not offered the control.**
 *
 * `PermissionsContext`'s own comment is right that this is never the real gate - `17-01`'s
 * server-side `IPermissionChecker` is - and that is exactly why this level exists rather than being
 * skipped: showing an admin action to a non-admin is still a defect, and a frontend test is the only
 * thing that can catch it. A 403 the operator receives after clicking is a worse product than a
 * control that was never there, and neither the server's tests nor a typecheck can tell the two apart.
 *
 * The real `PermissionsProvider` is mounted with `GET /api/v1/operators/me` faked, rather than a
 * hand-made context value: the answer travelling from the server's response to the rendered
 * navigation is the whole path this is meant to protect, and a fabricated context value would skip
 * the half of it that has actually broken before.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    // `19-03`: `null` (never left undefined - `config.ts`'s own `Config.faqApiBaseUrl` remarks) is
    // the "not configured" state `FaqModulePage`'s knowledge-base panel renders as its own honest
    // empty state rather than attempting a call - the gating tests below only need `modulesApi`
    // mocked as a result, the identical simplification `moduleConfigValidation.ts` gives client-side
    // entry-point checking.
    faqApiBaseUrl: null,
    // `22-06`: a real (fake, test-only) URL by default, so the calendar-gating tests below exercise
    // the real screen rather than its "not configured" branch. Unlike `faqApiBaseUrl` above (`null`
    // by default, because only one panel on one screen depends on it), every calendar screen depends
    // on this one wholly - a `null` default here would have hidden the granted-and-rendered case from
    // every calendar test in this file. The one test that needs `null` (`is absent, not broken, when
    // calendarApiBaseUrl is unset`, below) mutates this same mocked `config` object directly for the
    // duration of that test and restores it afterwards, rather than forking a second config mock.
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const conversationsApi = vi.hoisted(() => ({ fetchAllConversationsForSite: vi.fn() }));
const widgetConfigApi = vi.hoisted(() => ({ fetchWidgetConfig: vi.fn(), updateWidgetConfig: vi.fn() }));
const installationApi = vi.hoisted(() => ({ fetchSiteInstallation: vi.fn() }));
const offlineAutoReplyApi = vi.hoisted(() => ({ fetchOfflineAutoReply: vi.fn(), updateOfflineAutoReply: vi.fn() }));
const cannedResponsesApi = vi.hoisted(() => ({ fetchCannedResponses: vi.fn(), updateCannedResponses: vi.fn() }));
const modulesApi = vi.hoisted(() => ({ fetchModules: vi.fn(), updateModule: vi.fn() }));
const calendarApi = vi.hoisted(() => ({ getPendingBookings: vi.fn() }));
// `13-07`: `PermissionsProvider` now calls this before `fetchMyPermissions` - unmocked, it would hit
// a real `fetch` and every scenario below (all of them single-tenant) would never reach
// `fetchMyPermissions` at all. `grants`/`beforeEach` below seed the single-tenant default; the
// switcher's own multi-tenant behaviour is `tenancySwitcher.test.tsx`'s job, not this file's.
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/conversationsApi.js", () => conversationsApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/widgetConfigApi.js", async () => {
  // `WidgetConfigError` is a real class the page does `instanceof` against, so the module keeps its
  // own definition of it and only its two network calls are replaced.
  const actual = await vi.importActual<typeof import("../api/widgetConfigApi.js")>("../api/widgetConfigApi.js");
  return { ...actual, ...widgetConfigApi };
});
// `10-06`: no `vi.importActual` needed here, unlike `widgetConfigApi.js` above - `installationApi.ts`
// exports no error class of its own (`InstallSnippetPage` imports `ApiProblemError` straight from
// `problemDetails.ts`), so the whole module is just the one network call being replaced.
vi.mock("../api/installationApi.js", () => installationApi);
vi.mock("../api/offlineAutoReplyApi.js", async () => {
  // Same reasoning as widgetConfigApi.js above - OfflineAutoReplyError is a real class the page
  // does `instanceof` against.
  const actual =
    await vi.importActual<typeof import("../api/offlineAutoReplyApi.js")>("../api/offlineAutoReplyApi.js");
  return { ...actual, ...offlineAutoReplyApi };
});
vi.mock("../api/cannedResponsesApi.js", async () => {
  // Same reasoning again - CannedResponsesError is a real class the page does `instanceof` against.
  const actual =
    await vi.importActual<typeof import("../api/cannedResponsesApi.js")>("../api/cannedResponsesApi.js");
  return { ...actual, ...cannedResponsesApi };
});
vi.mock("../api/modulesApi.js", async () => {
  // Same reasoning again - ModulesError is a real class the page does `instanceof` against.
  const actual = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
  return { ...actual, ...modulesApi };
});
vi.mock("../api/calendarApi.js", async () => {
  // Same reasoning again - `CalendarApiError` is a real class `calendarErrorMessage.ts` does
  // `instanceof` against.
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** The operator layout as `App.tsx` wires it, reduced to the parts that decide what is offered. */
function shellAt(path: string, page: ReactNode = null) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route element={<OperatorShell />}>
              <Route path={path} element={page} />
            </Route>
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function pageOnly(path: string, page: ReactNode) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path={path} element={page} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function grants(permissions: string[], enabledModules: string[] = []): void {
  // `23-21`: `enabledModules` defaults to `[]`, not to `["calendar"]` - the "tenant does not have
  // this at all" state is meant to be the ordinary default here, the same way `permissions` defaults
  // to whatever the caller passes rather than to "everything". Tests about the calendar's own
  // forbidden/absent distinction pass the second argument explicitly.
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions, siteId: SITE_ID, enabledModules });
}

/** `23-24`: reads only `.ago-shell__nav-link-label`, not the whole link's `textContent` - a muted
 * entry also carries `NavLockGlyph`'s own visually-hidden label right beside it
 * (`AppShell.tsx`'s own doc comment), and this helper's job is "what does this nav item say", not
 * "everything a screen reader would read out for it". `mutedNavLabels`/`lockedLabelFor` below are
 * where the muted state itself is asserted. */
function navLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__nav a").map(
    (link) => (link.querySelector(".ago-shell__nav-link-label")?.textContent ?? "").trim(),
  );
}

/** `11-14`'s own drawer, scoped to its distinct `.ago-shell__drawer-nav` class so this never
 * accidentally counts the bar's `.ago-shell__nav` links (or vice versa) - the two are always
 * rendered from the same `nav` array (`AppShell.tsx`'s own remarks), never merged into one list,
 * because only one of the two is ever visually reachable at a given viewport. */
function drawerNavLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__drawer-nav a").map(
    (link) => (link.querySelector(".ago-shell__nav-link-label")?.textContent ?? "").trim(),
  );
}

/** `23-24`, decision §10: the labels of every nav-bar entry currently drawn `--muted` - a real,
 * clickable link the signed-in operator lacks the permission for, but a colleague at this tenant
 * could grant. Kept separate from `navLabels` above rather than folded into one richer return shape,
 * so a test that only cares about *which entries exist* (most of them) does not also have to spell
 * out which ones are muted. */
function mutedNavLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__nav a.ago-shell__nav-link--muted").map(
    (link) => (link.querySelector(".ago-shell__nav-link-label")?.textContent ?? "").trim(),
  );
}

function openDrawer(container: HTMLElement): Promise<void> {
  return interact(() => one<HTMLButtonElement>(container, ".ago-shell__menu-button").click());
}

function drawerDialog(container: HTMLElement): HTMLDialogElement {
  return one<HTMLDialogElement>(container, ".ago-dialog--drawer");
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  grants([]);
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  conversationsApi.fetchAllConversationsForSite.mockResolvedValue({ conversations: [] });
  widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
    siteId: SITE_ID,
    primaryColorHex: null,
    position: "BottomRight",
    locale: "En",
  });
  installationApi.fetchSiteInstallation.mockResolvedValue({
    publicKey: "shop_7f3a",
    allowedOrigins: ["https://tenant.example"],
  });
  offlineAutoReplyApi.fetchOfflineAutoReply.mockResolvedValue({ enabled: false, fallbackReply: "", rules: [] });
  cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);
  modulesApi.fetchModules.mockResolvedValue({ modules: [] });
  calendarApi.getPendingBookings.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("the operator navigation", () => {
  it("offers the site-wide sections muted, not absent, to an operator the server gave neither site:configure nor site:erase", async () => {
    // `23-24`, decision §10: "absent looks like forbidden" was `23-21`'s finding for the calendar
    // alone - this is the identical fix generalised to every gate a colleague at this tenant could
    // grant. Before this item this operator saw only "Conversations"; now every entry is drawn, and
    // the muted styling plus the lock glyph (`AppShell.tsx`) is what tells them apart from a granted
    // one, not their presence or absence.
    grants(["conversation:read"]);

    const container = await render(shellAt("/"));

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
    ]);
    // Every gated entry, muted - "Conversations" itself never is, holding it needs no permission.
    expect(mutedNavLabels(container)).toEqual([
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
    ]);
  });

  it("offers the site-wide sections ordinary, and only Delete account muted, to an operator who holds site:configure but not site:erase", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));

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
    ]);
    // `16-02`'s own independent gate: `site:configure` says nothing about `site:erase`, so this is
    // the one entry still muted for this operator.
    expect(mutedNavLabels(container)).toEqual(["Delete account"]);
  });

  it("mutes nothing at all for an operator who holds both site:configure and site:erase", async () => {
    grants(["site:configure", "site:erase"]);

    const container = await render(shellAt("/"));

    expect(mutedNavLabels(container)).toEqual([]);
  });

  it("offers the five calendar screens ordinary, and every other gated entry muted, to an operator who holds only calendar:configure", async () => {
    // `22-06`/`adr/0093`: a distinct permission from `site:configure` above - a tenant grants it
    // independently (`22-05`'s own `Ago.Chat.Domain.Permission` addition), and this operator holds
    // only this one. Five, not six: `22-05` (`adr/0093`, merged into `ago-calendar` while this item
    // was in flight) deleted that product's own `operators`/`roles` tables and the console endpoints
    // that managed them, so there is no Access screen - it was never wired here.
    //
    // `23-24`: before this item, holding only `calendar:configure` meant "nothing else gated" -
    // every `site:configure`/`site:erase` entry was simply absent. Now they are drawn too, muted,
    // for the identical decision §10 reason every other test in this describe block exercises.
    grants(["calendar:configure"]);

    const container = await render(shellAt("/"));

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
      "Queue",
      "Setup",
      "Workers",
      "Availability",
      "Contacts",
    ]);
    expect(mutedNavLabels(container)).toEqual([
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
    ]);
  });

  it("offers one calendar entry, not five, to an operator without calendar:configure on a tenant that has the module", async () => {
    // `23-21`: the fix for `flows.md` 4.3's own must-never-happen, generalised from `22-14`. Before
    // this item the nav offered nothing at all here, indistinguishable from a tenant that has never
    // enabled the calendar - see the test right below for that other case. One entry, not the full
    // five: the other four are unreachable without the permission regardless, so offering them would
    // be five dead links rather than one honest one.
    grants(["site:configure"], ["calendar"]);

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toContain("Queue");
    expect(navLabels(container)).not.toContain("Setup");
    expect(navLabels(container)).not.toContain("Workers");
    // `23-24`: the one inconsistency between this gate and the other two, before this item - this
    // entry used to be drawn ordinary. Now it carries the identical muted treatment
    // `site:configure`/`site:erase` entries get above, so the three gates are one treatment, not two
    // (`docs/backlog/23-24-*.md`'s own Done-when). `Delete account` is muted too - this grant holds
    // `site:configure` but not `site:erase`, an independent gate.
    expect(mutedNavLabels(container)).toEqual(["Delete account", "Queue"]);
  });

  it("offers no calendar entry at all to an operator on a tenant that has never enabled the module", async () => {
    // `23-21`: the deliberate under-disclosure half of the same fix - a nav item for a capability no
    // colleague at this tenant could ever grant would be exactly the over-disclosure `flows.md` 4.3
    // warns against, so this tenant's nav stays silent about the calendar, same as before this item.
    grants(["site:configure"], []);

    const container = await render(shellAt("/"));

    expect(navLabels(container)).not.toContain("Queue");
  });

  it("offers nothing gated while the answer is still in flight", async () => {
    // "Not yet known" is not "allowed" - `PermissionsContext`'s own rule. Rendering the links
    // optimistically and removing them would flash an admin section at every operator on every load.
    operatorsApi.fetchMyPermissions.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toEqual(["Conversations"]);
  });

  it("offers nothing gated when the permissions call fails", async () => {
    // Fail-closed: a console that cannot find out what an operator may do must not guess "everything".
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    operatorsApi.fetchMyPermissions.mockRejectedValue(new Error("network down"));

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toEqual(["Conversations"]);
    expect(logged).toHaveBeenCalled();
  });

  it("does not offer the platform-owner section to an operator the server refuses", async () => {
    grants(["site:configure"]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");

    const container = await render(shellAt("/"));

    expect(navLabels(container)).not.toContain("Platform sites");
  });

  it("offers it to the one identity the server says is eligible", async () => {
    grants([]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toContain("Platform sites");
  });

  it("offers the tenant's own sections and the platform-owner one together, to an identity holding both", async () => {
    // `12-05`. Until this item nobody could hold both on a fresh deployment - the owner had no
    // `operators` row and `12-04` refused to let them get one - so "both entries appear" was never
    // once observed, which is exactly how `12-04`'s bug survived a week. The two answers come from
    // two independent servers-side sources (`GET /api/v1/operators/me` for the site-scoped
    // permissions, `GET /api/v1/owner/sites` for the realm role) and this asserts the *whole* list
    // rather than `toContain`, because the failure worth catching is one suppressing the other -
    // which a containment check on either one alone would miss.
    grants(["site:configure"]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");

    const container = await render(shellAt("/"));

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

  it("does not offer the platform-owner section while the probe is unanswered", async () => {
    ownerApi.probeOwnerEligibility.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(navLabels(container)).not.toContain("Platform sites");
  });
});

/**
 * `23-24`, decision §10's own two bounds: the glyph must carry a translated hidden label (`11-13`
 * makes an untranslated one a gate failure), and it must never be the *only* signal a muted entry
 * carries - the muted colour alone would be ambiguous (this item's own reasoning, restated in
 * `AppShellNavItem.muted`'s doc comment), so both have to be checked, not just one.
 */
describe("the lock glyph on a muted nav entry", () => {
  it("carries a visually-hidden, translated label - present for a muted entry, absent for an ordinary one", async () => {
    grants(["site:configure"]); // holds site:configure, lacks site:erase

    const container = await render(shellAt("/"));

    const ordinaryLink = byText<HTMLAnchorElement>(container, ".ago-shell__nav a", "Billing");
    expect(ordinaryLink?.querySelector(".ago-shell__nav-lock")).toBeNull();

    const mutedLink = one<HTMLAnchorElement>(container, ".ago-shell__nav a.ago-shell__nav-link--muted");
    expect(mutedLink.textContent).toContain("Delete account");
    const hiddenLabel = mutedLink.querySelector(".ago-shell__nav-lock .ago-visually-hidden");
    expect(hiddenLabel?.textContent).toBe("Locked - you do not currently have this permission");
    // The mark itself carries no information a screen reader can use - the hidden text right beside
    // it is what actually says so (`NavLockGlyph`'s own doc comment).
    expect(mutedLink.querySelector(".ago-shell__nav-lock-icon")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays a real, keyboard-reachable link - never `disabled`, never `aria-disabled`", async () => {
    // Decision §10's own reasoning: the destination page is where the explanation lives, because
    // this console has no tooltip - a `disabled` control could not be reached to get there at all.
    grants([]);

    const container = await render(shellAt("/"));

    // Not `byText` here - a muted link's full `textContent` also carries the lock glyph's hidden
    // label, so an exact-text match against just "Billing" would find nothing (`navLabels`'s own doc
    // comment has the identical reasoning for why it reads `.ago-shell__nav-link-label` alone).
    const mutedLink = all(container, ".ago-shell__nav a").find(
      (a) => a.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() === "Billing",
    ) as HTMLAnchorElement | undefined;
    expect(mutedLink).not.toBeUndefined();
    expect(mutedLink?.hasAttribute("disabled")).toBe(false);
    expect(mutedLink?.getAttribute("aria-disabled")).toBeNull();
    expect(mutedLink?.tagName).toBe("A");
    expect(mutedLink?.getAttribute("href")).toBe("/settings/billing");
  });
});

/**
 * `11-14`. The claim `ago-root#317` names explicitly: the drawer and the bar must never be able to
 * disagree about what an operator may see, because they render from the same `buildTenantNavItems`
 * array (`AppShell.tsx`'s own remarks) rather than each holding an independent list. An assertion
 * that only checks the *granted* case would pass even if the drawer ignored permissions entirely (a
 * hardcoded, always-everything list happens to match a fully-permitted operator too) - the
 * under-permissioned case below is the one that actually distinguishes "reads the filtered array"
 * from "reads something else that merely looks right for this one operator".
 */
describe("the mobile navigation drawer", () => {
  it("starts closed, with the hamburger announcing that", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));

    const menuButton = one<HTMLButtonElement>(container, ".ago-shell__menu-button");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    expect(drawerDialog(container).open).toBe(false);
  });

  it("opens on the hamburger, and says so", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);

    expect(drawerDialog(container).open).toBe(true);
    expect(one<HTMLButtonElement>(container, ".ago-shell__menu-button").getAttribute("aria-expanded")).toBe("true");
  });

  it("offers the site-wide sections muted, not absent, to an operator the server gave no site:configure", async () => {
    // `23-24`: the drawer is a second renderer over the identical `nav` array the bar uses
    // (`AppShell.tsx`'s own remarks) - this is that same fix, asserted through the drawer's own
    // markup rather than assumed from the bar's test above.
    grants(["conversation:read"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);

    expect(drawerNavLabels(container)).toEqual([
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
    ]);
  });

  it("offers exactly what the bar offers, to an operator the server says holds site:configure", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);

    expect(drawerNavLabels(container)).toEqual(navLabels(container));
  });

  it("closes when an item is chosen", async () => {
    grants(["site:configure"]);

    // `shellAt` registers only one route (`path`, here `"/"`), matching every other test in this
    // file - clicking "Conversations" (the one item that stays on `"/"`) is what this harness can
    // observe; a real cross-route click is `mobileNavDrawer.spec.ts`'s job, against the real router
    // in a real browser (`AppShell`'s own doc comment on where the browser-only half of this claim
    // lives).
    const container = await render(shellAt("/"));
    await openDrawer(container);
    expect(drawerDialog(container).open).toBe(true);

    await interact(() => byText<HTMLAnchorElement>(container, ".ago-shell__drawer-nav a", "Conversations")?.click());

    expect(drawerDialog(container).open).toBe(false);
  });

  it("closes on a click outside the panel - the backdrop", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);
    const dialog = drawerDialog(container);
    expect(dialog.open).toBe(true);

    // `Dialog.tsx`'s own backdrop detection: a click whose target is the `<dialog>` element itself,
    // never its `.ago-dialog__inner` content - the standard way to tell a backdrop click from a
    // content click, since `::backdrop` is not an event target of its own.
    await interact(() => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(dialog.open).toBe(false);
  });

  it("closes on Escape - the native cancel route `Dialog` wires onClose to", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);
    const dialog = drawerDialog(container);
    expect(dialog.open).toBe(true);

    // jsdom's `<dialog>` implements neither `showModal()` nor real Escape handling
    // (`testing/dom.tsx`'s own comment) - a real browser fires this `cancel` event itself once
    // `showModal()` has made the dialog modal; this dispatches the same event Escape would produce,
    // which is what `Dialog`'s own `onCancel` handler is actually wired to.
    await interact(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));

    expect(dialog.open).toBe(false);
  });
});

describe("a gated page reached directly by URL", () => {
  it("refuses the site-wide conversation list, and does not even ask the server for it", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.textContent).toContain("You do not have permission to view every conversation for this site.");
    // `23-24`: the shared `AccessRefusal` appends the "who can grant it" sentence every one of these
    // fourteen screens used to lack - `docs/backlog/23-24-*.md`'s own Done-when: "reaches a refusal
    // naming who can grant them".
    expect(container.textContent).toContain("Ask an owner or admin at this workspace to grant it to you.");
    expect(container.querySelector("table")).toBeNull();
    expect(conversationsApi.fetchAllConversationsForSite).not.toHaveBeenCalled();
  });

  it("renders the site-wide conversation list for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(conversationsApi.fetchAllConversationsForSite).toHaveBeenCalled();
  });

  /** Found live, 2026-08-27: `/admin`'s table sat inside the reading-width `<main>` every ordinary
   * document uses, which left a gap on both sides that lined up with nothing above or below it - a
   * five-column table is not prose. Needs the real `OperatorShell` mounted (`shellAt`, not
   * `pageOnly`, which the two tests above use precisely to skip it) because the wide/reading-width
   * choice is `OperatorShell`'s own route match, not something `AdminConversationsPage` decides. */
  /** Found live, 2026-08-27: `/settings/widget` and `/settings/auto-reply` had the identical
   * unexplained gap `/admin` did - a form is not meaningfully narrower than a table, and every route
   * `OperatorShell` renders is wide now, unconditionally. */
  it.each([
    ["/admin", <AdminConversationsPage key="admin" />],
    ["/settings/install", <InstallSnippetPage key="install" />],
    ["/settings/widget", <WidgetConfigPage key="widget" />],
    ["/settings/auto-reply", <OfflineAutoReplyPage key="auto-reply" />],
    ["/settings/canned-responses", <CannedResponsesPage key="canned-responses" />],
    ["/settings/faq", <FaqModulePage key="faq" />],
  ])("renders %s in the shell's full width, the same as the workspace routes", async (path, page) => {
    grants(["site:configure"]);

    const container = await render(shellAt(path, page));

    expect(container.querySelector(".ago-shell__main")?.classList.contains("ago-shell__main--wide")).toBe(true);
  });

  /** Found live, 2026-08-29: `4b6bec3` made the line above pass, and also made every one of these
   * routes lose vertical scrolling entirely - `wide` and `fixed` (viewport-bounded, `overflow:
   * hidden` `<main>`) were the same flag, and none of these pages owns an internal scroll region the
   * way the workspace does (`.ago-table-scroll` on `/admin` only scrolls horizontally). Content taller
   * than the viewport clipped silently, with no scrollbar anywhere - reproduced live on
   * `/settings/tags` and `/analytics`. `wide` and `fixed` are independent props now
   * (`AppShell.tsx`'s own doc comments); this is the regression test for that split staying split. */
  it.each([
    ["/admin", <AdminConversationsPage key="admin" />],
    ["/settings/install", <InstallSnippetPage key="install" />],
    ["/settings/widget", <WidgetConfigPage key="widget" />],
    ["/settings/auto-reply", <OfflineAutoReplyPage key="auto-reply" />],
    ["/settings/canned-responses", <CannedResponsesPage key="canned-responses" />],
    ["/settings/faq", <FaqModulePage key="faq" />],
  ])("keeps %s page-scrollable - it has no internal scroll region of its own", async (path, page) => {
    grants(["site:configure"]);

    const container = await render(shellAt(path, page));

    expect(container.querySelector(".ago-shell")?.classList.contains("ago-shell--fixed")).toBe(false);
    expect(container.querySelector(".ago-shell__main")?.classList.contains("ago-shell__main--fixed")).toBe(false);
  });

  /** Found the same day: `PageHead`'s own heading/description, the `Panel`'s title/description, and
   * the `Table`'s own caption all said "every conversation for this site" in slightly different
   * words, stacked. One visible heading now carries it; the table's caption still carries it for a
   * screen-reader user, just no longer rendered on screen too. */
  it("says what the table lists exactly once on screen, not three times", async () => {
    grants(["site:configure"]);
    // A table needs at least one row to render at all - `AdminConversationsPage` shows "No
    // conversations yet." instead of a `<Table>` for an empty list, and this test is specifically
    // about the caption `<Table>` itself renders.
    conversationsApi.fetchAllConversationsForSite.mockResolvedValue({
      conversations: [
        {
          conversationId: "c1",
          visitorId: "v1",
          state: "Waiting",
          createdAt: "2026-08-27T00:00:00Z",
          operatorUnreadCount: 0,
          operatorId: null,
        },
      ],
    });

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.textContent).toContain("Every conversation for this site");
    expect(container.textContent).not.toContain("Site conversations");
    const caption = container.querySelector("table caption");
    expect(caption?.classList.contains("ago-visually-hidden")).toBe(true);
  });

  /** Found live, 2026-08-27: `.ago-table-scroll` already renders its own complete card (border,
   * radius, background) - wrapping it in a titleless `Panel` nested a second card inside the first,
   * and the outer one's padding was the "extra white container" around the table. */
  it("does not nest the table inside a second Panel card", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.querySelector(".ago-panel")).toBeNull();
  });

  it("says nothing either way while the permissions answer is in flight", async () => {
    // Refusing before the answer arrives would accuse every operator of lacking a permission they
    // may well hold, for as long as one HTTP round trip takes.
    operatorsApi.fetchMyPermissions.mockReturnValue(new Promise(() => undefined));

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(container.textContent).toContain("Checking your permissions");
  });

  it("refuses the widget configuration form, and does not load the site's config", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/settings/widget", <WidgetConfigPage />));

    expect(container.textContent).toContain("You do not have permission to configure this site");
    expect(container.querySelector("form")).toBeNull();
    expect(widgetConfigApi.fetchWidgetConfig).not.toHaveBeenCalled();
  });

  it("renders the widget configuration form for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/settings/widget", <WidgetConfigPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(widgetConfigApi.fetchWidgetConfig).toHaveBeenCalledWith("token", SITE_ID);
    expect(byText(container, "button", "Save")).not.toBeNull();
  });

  /** `10-06`. */
  it("refuses the install screen, and does not load the site's installation details", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/settings/install", <InstallSnippetPage />));

    expect(container.textContent).toContain("You do not have permission to view this site's installation details.");
    expect(installationApi.fetchSiteInstallation).not.toHaveBeenCalled();
  });

  it("renders the install screen for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/settings/install", <InstallSnippetPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(installationApi.fetchSiteInstallation).toHaveBeenCalledWith("token", SITE_ID);
    expect(container.textContent).toContain("shop_7f3a");
  });

  it("refuses the canned-responses form, and does not load the site's library", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/settings/canned-responses", <CannedResponsesPage />));

    expect(container.textContent).toContain("You do not have permission to configure this site's canned responses.");
    expect(container.querySelector("form")).toBeNull();
    expect(cannedResponsesApi.fetchCannedResponses).not.toHaveBeenCalled();
  });

  it("renders the canned-responses form for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/settings/canned-responses", <CannedResponsesPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(cannedResponsesApi.fetchCannedResponses).toHaveBeenCalledWith("token", SITE_ID);
    expect(byText(container, "button", "Save")).not.toBeNull();
  });

  it("refuses the AI FAQ assistant screen, and does not load the site's modules", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/settings/faq", <FaqModulePage />));

    expect(container.textContent).toContain("You do not have permission to configure this site's AI FAQ assistant.");
    expect(container.querySelector("form")).toBeNull();
    expect(modulesApi.fetchModules).not.toHaveBeenCalled();
  });

  it("renders the AI FAQ assistant screen for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/settings/faq", <FaqModulePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(modulesApi.fetchModules).toHaveBeenCalledWith("token", SITE_ID);
    // The knowledge-base panel renders its own "not configured" state, not a second form, because
    // this file's mocked `config.faqApiBaseUrl` is `null` - only the module-registration form's own
    // Save button exists here.
    expect(byText(container, "button", "Save")).not.toBeNull();
    expect(container.textContent).toContain("not configured for this deployment yet");
  });

  it("refuses the calendar booking queue on a tenant that has it, and does not load its data", async () => {
    // `22-06`/`adr/0093`: a distinct permission from `site:configure` - an operator holding that one
    // alone still sees no calendar screen, matching every other calendar-gated case in this file.
    // `23-21`: the tenant *does* have the module enabled here (`["calendar"]`) - the "forbidden", not
    // "absent", half of the distinction the item exists to draw. See the next test for the other half.
    grants(["site:configure"], ["calendar"]);

    const container = await render(pageOnly("/calendar", <CalendarQueuePage />));

    expect(container.textContent).toContain("You do not have permission to view the calendar's booking queue.");
    expect(container.textContent).toContain("Ask an owner or admin at this workspace to grant it to you.");
    expect(container.querySelector("table")).toBeNull();
    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
  });

  it("says the calendar is not part of this workspace, when the tenant never enabled it", async () => {
    // `23-21`'s own Done-when: this and the test above must render distinguishable states rather
    // than the identical "You do not have permission" sentence every operator without the
    // permission used to see regardless of their tenant's own module state.
    grants(["site:configure"], []);

    const container = await render(pageOnly("/calendar", <CalendarQueuePage />));

    expect(container.textContent).not.toContain("You do not have permission to view the calendar's booking queue.");
    expect(container.textContent).toContain("This workspace does not have the calendar.");
    expect(container.querySelector("table")).toBeNull();
    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
  });

  it("renders the calendar booking queue for an operator who holds calendar:configure", async () => {
    grants(["calendar:configure"]);

    const container = await render(pageOnly("/calendar", <CalendarQueuePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(calendarApi.getPendingBookings).toHaveBeenCalledWith("token", expect.anything());
  });

  /**
   * `22-06`'s own second Done-when: absent, not broken, when `calendarApiBaseUrl` is unset - the
   * identical "a real, honest deployment state" shape `FaqModulePage`'s knowledge-base panel already
   * has for `faqApiBaseUrl`, applied here to a whole screen rather than to one panel of one. This
   * file's own `config.js` mock defaults `calendarApiBaseUrl` to a real (fake) URL so every test above
   * exercises the granted-and-rendered case - this is the one test that mutates that same mocked
   * object to `null` for its own duration and restores it, rather than forking a second config mock
   * `config.ts`'s own module-level `import.meta.env` shape has no room for two conflicting values of.
   */
  it("is absent, not broken, when calendarApiBaseUrl is unset", async () => {
    grants(["calendar:configure"]);
    const { config } = await import("../config.js");
    const original = config.calendarApiBaseUrl;
    config.calendarApiBaseUrl = null;

    try {
      const container = await render(pageOnly("/calendar", <CalendarQueuePage />));

      expect(container.textContent).toContain(
        "The calendar backend is not configured for this deployment yet, so this screen cannot be used here.",
      );
      expect(container.querySelector("table")).toBeNull();
      expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
    } finally {
      config.calendarApiBaseUrl = original;
    }
  });
});
