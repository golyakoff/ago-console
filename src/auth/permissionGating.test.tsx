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
import { DeviceStorageDisclosurePage } from "../pages/DeviceStorageDisclosurePage.js";
import { OfflineAutoReplyPage } from "../pages/OfflineAutoReplyPage.js";
import { CannedResponsesPage } from "../pages/CannedResponsesPage.js";
import { FaqModulePage } from "../pages/FaqModulePage.js";
import { CalendarQueuePage } from "../pages/CalendarQueuePage.js";
import { CalendarBookingsPage } from "../pages/CalendarBookingsPage.js";
import { CalendarContactsPage } from "../pages/CalendarContactsPage.js";
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
// `23-05`: OfflineAutoReplyPage now renders a second, independent panel on the same mount - mocked
// the same way its sibling above is, so this file's own renders of it do not trigger a real,
// unmocked `fetch`.
const assignmentPenaltyApi = vi.hoisted(() => ({
  fetchAssignmentPenalty: vi.fn(),
  updateAssignmentPenalty: vi.fn(),
}));
const cannedResponsesApi = vi.hoisted(() => ({ fetchCannedResponses: vi.fn(), updateCannedResponses: vi.fn() }));
const modulesApi = vi.hoisted(() => ({ fetchModules: vi.fn(), updateModule: vi.fn() }));
const calendarApi = vi.hoisted(() => ({
  getPendingBookings: vi.fn(),
  getConfirmedBookings: vi.fn(),
  getContacts: vi.fn(),
}));
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
vi.mock("../api/assignmentPenaltyApi.js", async () => {
  // Same reasoning again - AssignmentPenaltyError is a real class the page does `instanceof` against.
  const actual =
    await vi.importActual<typeof import("../api/assignmentPenaltyApi.js")>("../api/assignmentPenaltyApi.js");
  return { ...actual, ...assignmentPenaltyApi };
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
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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

/**
 * `23-31`: the accordion's own section headers, in order - `.ago-shell__rail-section` for the
 * desktop rail, `.ago-shell__drawer-section` for the mobile drawer (`sectionLabels`'s own `variant`
 * parameter picks which). This is the count that has to be exactly four for a bare operator and
 * seven for a full tenant/admin (`23-31`'s own Done-when) - a section that has no visible items is
 * never rendered at all (`consoleNav.ts`'s `buildSection`), so this list *is* "which sections exist"
 * for the signed-in identity, not merely "which sections have a header drawn".
 */
function sectionLabels(container: HTMLElement, variant: "rail" | "drawer" = "rail"): string[] {
  const selector = variant === "rail" ? ".ago-shell__rail-section" : ".ago-shell__drawer-section";
  return all(container, selector).map((button) => button.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() ?? "");
}

/** Opens one section by its own header text, closing whichever section was open before it - the
 * accordion's own "one section open at a time" rule (`AppShell.tsx`'s own `openId` state). Awaited
 * through `interact` because the click sets React state. */
function openSection(container: HTMLElement, label: string, variant: "rail" | "drawer" = "rail"): Promise<void> {
  const selector = variant === "rail" ? ".ago-shell__rail-section" : ".ago-shell__drawer-section";
  return interact(() => {
    const button = byText<HTMLButtonElement>(container, selector, label);
    if (!button) {
      throw new Error(`permissionGating.test.tsx: no section header reads "${label}" (variant: ${variant}).`);
    }
    button.click();
  });
}

/**
 * `23-31`: the labels of every item inside whichever section is currently *open* - real links
 * (`.ago-shell__rail-link`) and reserved placeholders (`.ago-shell__rail-link--reserved`) alike,
 * since both carry a real `.ago-shell__nav-link-label` span (`AppShell.tsx`'s `NavSections`). Reads
 * only that label span, not the whole element's `textContent` - a muted or reserved entry also
 * carries a `Badge` right beside it (`strings.navBuyableLabel`/`navComingSoonLabel`), and this
 * helper's job is "what does this item say", not "everything visible next to it". `mutedItemLabels`/
 * `reservedItemLabels` below are where those two badge states are asserted.
 */
function itemLabels(container: HTMLElement, variant: "rail" | "drawer" = "rail"): string[] {
  const selector = variant === "rail" ? ".ago-shell__rail-items" : ".ago-shell__drawer-items";
  return all(container, `${selector} .ago-shell__nav-link-label`).map((label) => label.textContent?.trim() ?? "");
}

/** `23-31`/`adr/0129`: the labels of every item inside the open section drawn `--muted` - the
 * *replaced* meaning of that state (this identity could buy the thing itself), never "a colleague
 * could grant it" any more. In this console today that is only ever the calendar's own single
 * representative entry (`consoleNav.ts`'s `buildCalendarItems`). */
function mutedItemLabels(container: HTMLElement, variant: "rail" | "drawer" = "rail"): string[] {
  const selector = variant === "rail" ? ".ago-shell__rail-link--muted" : ".ago-shell__drawer-link--muted";
  return all(container, selector).map((link) => link.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() ?? "");
}

/** `23-31`: the labels of every *reserved* place inside the open section - drawn inert, never a
 * working link (`AppShellNavItem.reserved`'s own doc comment). */
function reservedItemLabels(container: HTMLElement, variant: "rail" | "drawer" = "rail"): string[] {
  const selector = variant === "rail" ? ".ago-shell__rail-link--reserved" : ".ago-shell__drawer-link--reserved";
  return all(container, selector).map((span) => span.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() ?? "");
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
  assignmentPenaltyApi.fetchAssignmentPenalty.mockResolvedValue({ penaltySeconds: 120 });
  cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);
  modulesApi.fetchModules.mockResolvedValue({ modules: [] });
  calendarApi.getPendingBookings.mockResolvedValue([]);
  calendarApi.getConfirmedBookings.mockResolvedValue([]);
  calendarApi.getContacts.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("the operator navigation", () => {
  // `23-31`/`adr/0129`: the replaced muting rule, exercised end to end. Every gate that used to be
  // "muted when lacking" (site:configure/site:erase/site:manage_operators) is now hide-when-lacking,
  // ordinary-when-holding - only the calendar keeps a muted state, and only for an identity that
  // holds `site:configure` (this file's own `consoleNav.ts` doc comment: that permission is the proxy
  // for "this identity is the tenant, and could buy the module itself").

  it("offers exactly four sections, and nothing muted, to an operator with no tenant-level permission at all", async () => {
    // The item's own Done-when, word for word. `conversation:read` is an ordinary operator
    // permission that gates nothing in this file - it stands in for "a real operator seat with no
    // administrative grant at all".
    grants(["conversation:read"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Team"]);
    await openSection(container, "Conversations");
    expect(itemLabels(container)).toEqual(["Mine"]);
    await openSection(container, "Analytics");
    expect(itemLabels(container)).toEqual(["My numbers"]);
    await openSection(container, "Team");
    expect(itemLabels(container)).toEqual(["Team chat"]);
    // `23-32`: no longer reserved - TeamChatPage is a real route now, unconditional like every other
    // entry `buildTeamItems` draws.
    expect(reservedItemLabels(container)).toEqual([]);
    expect(mutedItemLabels(container)).toEqual([]);
  });

  it("adds the Calendar section, ordinary and unmuted, for an operator who also holds calendar:configure - four sections, the one named in the Done-when", async () => {
    // `22-06`/`adr/0093`: `calendar:configure` is granted independently of every tenant-level
    // permission - a masseuse/hairdresser operator holds exactly this and nothing else. This is the
    // scenario the item's own "an operator sees exactly four sections" line describes: Calendar
    // is the fourth, not Team a second time.
    grants(["calendar:configure"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Calendar", "Team"]);
    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting", "Bookings", "Contacts", "Masters", "Services", "Schedule", "Setup", "Phone reveals", "Merges"]);
    // `23-34`: "Bookings" is a real link now (`/calendar/bookings`, `CalendarBookingsPage`) - it was
    // `reserved` only until this item gave the confirmed-bookings screen an actual route.
    expect(reservedItemLabels(container)).toEqual([]);
    expect(mutedItemLabels(container)).toEqual([]);
  });

  it("`23-34`/`23-57`: offers the Calendar section with Bookings and Contacts, to an operator who holds customer:read but neither calendar:configure nor site:configure", async () => {
    // The seeded "Operator" role's own permission set (`ago-chat`'s own
    // `RegisterSiteHandler.OperatorRolePermissions`) - `customer:read` without `calendar:configure` -
    // is exactly this scenario, not a hypothetical one. Before `23-34`, `buildCalendarItems` had no
    // branch for it at all, so this identity saw no Calendar section whatsoever, the same shape the
    // "offers no Calendar section" test above still proves for an operator holding neither.
    // `23-57` adds Contacts (`/calendar/clients`) beside Bookings - both read the customer list
    // `customer:read` guards server-side, so both are drawn from the identical permission check.
    grants(["customer:read"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Calendar", "Team"]);
    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Bookings", "Contacts"]);
    expect(reservedItemLabels(container)).toEqual([]);
    expect(mutedItemLabels(container)).toEqual([]);
  });

  it("`23-57`: offers the Calendar section with the Waiting entry, ordinary and unmuted, to an operator who holds the booking permissions but neither calendar:configure nor site:configure", async () => {
    // The seeded "Operator" role's own permission set (`ago-chat`'s own
    // `RegisterSiteHandler.OperatorRolePermissions`) holds booking:confirm/booking:reject/
    // booking:cancel without calendar:configure - exactly this scenario, not a hypothetical one.
    // Before this item `buildCalendarItems` had no branch for it at all: an operator holding the
    // right to confirm, reject and cancel a booking saw no Calendar section whatsoever, and so no
    // screen from which to reach the queue their own permissions already let them act on
    // (`docs/backlog/23-57-*.md`'s own finding).
    grants(["booking:confirm", "booking:reject", "booking:cancel"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Calendar", "Team"]);
    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting"]);
    expect(reservedItemLabels(container)).toEqual([]);
    expect(mutedItemLabels(container)).toEqual([]);
  });

  it("`23-57`: offers Waiting, Bookings and Contacts together to an operator holding the seeded Operator role's full booking-and-customer set", async () => {
    grants(["booking:confirm", "booking:reject", "booking:cancel", "booking:mark_no_show", "customer:read", "customer:edit"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Calendar", "Team"]);
    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting", "Bookings", "Contacts"]);
    expect(mutedItemLabels(container)).toEqual([]);
    expect(reservedItemLabels(container)).toEqual([]);
  });

  it("`23-57`: a single booking permission is enough to draw the Waiting entry - each calendar entry checks its own permission independently, not a bundle", async () => {
    grants(["booking:reject"]);

    const container = await render(shellAt("/"));

    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting"]);
  });

  it("offers every section ordinary, and only Delete account and Employees hidden, to an operator who holds site:configure but neither site:erase nor site:manage_operators", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));

    // All seven - Channels/Automation/Administration are drawn now because this identity is
    // the tenant (`isAdmin`), even without `calendar:configure` itself.
    expect(sectionLabels(container)).toEqual([
      "Conversations",
      "Analytics",
      "Calendar",
      "Team",
      "Channels",
      "Automation",
      "Administration",
    ]);

    await openSection(container, "Conversations");
    expect(itemLabels(container)).toEqual(["Mine", "All conversations", "Search"]);

    await openSection(container, "Analytics");
    expect(itemLabels(container)).toEqual(["My numbers", "Analytics", "Conversion", "Tag report", "Booking flow"]);

    // `adr/0129`: this identity lacks `calendar:configure` itself but holds `site:configure`, so the
    // calendar is muted - "buy it yourself" - rather than hidden, regardless of `enabledModules`
    // (`grants` above passed none).
    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting"]);
    expect(mutedItemLabels(container)).toEqual(["Waiting"]);

    // `23-22`: `site:manage_operators` is independent - "Employees" is hidden, not muted, and
    // "Team chat" stays (it needs no permission at all).
    await openSection(container, "Team");
    expect(itemLabels(container)).toEqual(["Team chat"]);

    // `23-36`: "Telegram bot" is a real item now - still listed by `itemLabels` (which does not
    // distinguish reserved from ordinary), but no longer by `reservedItemLabels`.
    await openSection(container, "Channels");
    expect(itemLabels(container)).toEqual(["Install widget", "Website widget", "MAX bot", "Telegram bot", "Other channels"]);
    expect(reservedItemLabels(container)).toEqual(["MAX bot", "Other channels"]);

    await openSection(container, "Automation");
    expect(itemLabels(container)).toEqual([
      "Canned responses",
      "AI suggestions",
      "Offline auto-reply",
      "AI auto-reply",
      "AI FAQ assistant",
      "Tags",
    ]);
    expect(reservedItemLabels(container)).toEqual(["AI suggestions", "AI auto-reply"]);

    // `16-02`: `site:erase` is independent too - "Delete account" is hidden here, not muted; the
    // other four Administration entries need only `site:configure`, which this identity holds.
    // `23-37`: "Documents" is a real item now - still listed by `itemLabels`, but no longer by
    // `reservedItemLabels` (`consoleNav.ts`'s own remarks: it now points at `DocumentsPage`).
    await openSection(container, "Administration");
    expect(itemLabels(container)).toEqual(["Products", "Billing", "Device data", "Documents"]);
    expect(reservedItemLabels(container)).toEqual([]);
  });

  it("offers every section and every item ordinary, nothing hidden and nothing muted, to an operator who holds every permission", async () => {
    grants(["site:configure", "site:erase", "site:manage_operators", "calendar:configure"], ["calendar"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual([
      "Conversations",
      "Analytics",
      "Calendar",
      "Team",
      "Channels",
      "Automation",
      "Administration",
    ]);
    expect(mutedItemLabels(container)).toEqual([]);

    await openSection(container, "Calendar");
    expect(itemLabels(container)).toEqual(["Waiting", "Bookings", "Contacts", "Masters", "Services", "Schedule", "Setup", "Phone reveals", "Merges"]);
    expect(mutedItemLabels(container)).toEqual([]);

    await openSection(container, "Team");
    expect(itemLabels(container)).toEqual(["Employees", "Team chat"]);

    await openSection(container, "Administration");
    expect(itemLabels(container)).toEqual(["Products", "Billing", "Device data", "Documents", "Delete account"]);
  });

  it("mutes the calendar for the tenant regardless of enabledModules - buying it is this identity's own decision either way", async () => {
    // `adr/0129`'s own simplification versus the rule it replaces: `23-21`'s three-way
    // `enabledModules` check decided what an *operator* saw; for the tenant (`isAdmin`) it never
    // changed anything, because whether to enable the module or grant themselves the permission are
    // both things they can do without anyone else's help. Same result with the module enabled...
    grants(["site:configure"], ["calendar"]);
    const enabled = await render(shellAt("/"));
    await openSection(enabled, "Calendar");
    expect(mutedItemLabels(enabled)).toEqual(["Waiting"]);
    await unmount();

    // ...and with it never switched on at all.
    grants(["site:configure"], []);
    const neverEnabled = await render(shellAt("/"));
    await openSection(neverEnabled, "Calendar");
    expect(mutedItemLabels(neverEnabled)).toEqual(["Waiting"]);
  });

  it("offers no Calendar section at all to an operator who lacks calendar:configure and is not the tenant - the accepted cost adr/0129 records", async () => {
    // `23-21`'s own fix left one muted entry here so an operator without the module could still
    // learn it exists. `adr/0129` withdraws that concession for a plain operator: "an operator sees
    // nothing muted at all", so this section is not drawn, whether or not the tenant has bought it.
    grants(["conversation:read"], ["calendar"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).not.toContain("Calendar");
  });

  it("offers only three sections, and nothing gated, while the permissions answer is still in flight", async () => {
    // "Not yet known" is not "allowed" - `PermissionsContext`'s own rule. This is the identical
    // fail-closed shape a permission-less operator gets, which is the safe direction to guess wrong
    // in for the second or so this answer takes.
    operatorsApi.fetchMyPermissions.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Team"]);
    await openSection(container, "Conversations");
    expect(itemLabels(container)).toEqual(["Mine"]);
  });

  it("offers only three sections, and nothing gated, when the permissions call fails", async () => {
    // Fail-closed: a console that cannot find out what an operator may do must not guess "everything".
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    operatorsApi.fetchMyPermissions.mockRejectedValue(new Error("network down"));

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual(["Conversations", "Analytics", "Team"]);
    expect(logged).toHaveBeenCalled();
  });

  /** `23-31`: "Platform sites" renders as `AppShell`'s own `pinnedItem` now - one flat link below
   * every accordion section, never inside one. `.ago-shell__rail-link--pinned` is the modifier class
   * `PinnedNavLink` adds on top of the ordinary link class, so it is found the same way any other
   * rail link is, then narrowed to the one carrying that modifier. */
  function pinnedLabel(container: HTMLElement): string | undefined {
    return all(container, ".ago-shell__rail-link--pinned .ago-shell__nav-link-label")[0]?.textContent?.trim();
  }

  it("does not offer the platform-owner link to an operator the server refuses", async () => {
    grants(["site:configure"]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");

    const container = await render(shellAt("/"));

    expect(pinnedLabel(container)).toBeUndefined();
  });

  it("offers it to the one identity the server says is eligible", async () => {
    grants([]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");

    const container = await render(shellAt("/"));

    expect(pinnedLabel(container)).toBe("Platform sites");
  });

  it("offers the tenant's own sections and the platform-owner link together, to an identity holding both", async () => {
    // `12-05`. Until this item nobody could hold both on a fresh deployment - the owner had no
    // `operators` row and `12-04` refused to let them get one - so "both appear" was never once
    // observed, which is exactly how `12-04`'s bug survived a week. The two answers come from two
    // independent server-side sources (`GET /api/v1/operators/me` for the site-scoped permissions,
    // `GET /api/v1/owner/sites` for the realm role).
    grants(["site:configure"]);
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");

    const container = await render(shellAt("/"));

    expect(sectionLabels(container)).toEqual([
      "Conversations",
      "Analytics",
      "Calendar",
      "Team",
      "Channels",
      "Automation",
      "Administration",
    ]);
    expect(pinnedLabel(container)).toBe("Platform sites");
  });

  it("does not offer the platform-owner link while the probe is unanswered", async () => {
    ownerApi.probeOwnerEligibility.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(pinnedLabel(container)).toBeUndefined();
  });
});

/**
 * `23-31`/`adr/0129`: the replaced muting rule's own two bounds, carried over from decision §10 -
 * the reason must be named, not left to a colour alone, and the entry must stay a real link. The
 * *reason* changed (buyable, not "a colleague could grant it"), so the mark did too: a visible
 * `Badge` naming `strings.navBuyableLabel`, not an icon with a hidden label - "muted" today has
 * exactly one occurrence (the calendar's own single entry for a tenant who lacks
 * `calendar:configure`), and there is room for a visible word right beside it.
 */
describe("the buyable badge on the calendar's muted entry", () => {
  it("carries a visible, translated badge naming why - present on the muted calendar entry, absent from an ordinary link", async () => {
    grants(["site:configure"]); // holds site:configure, lacks calendar:configure

    const container = await render(shellAt("/"));

    await openSection(container, "Analytics");
    const ordinaryLink = byText<HTMLAnchorElement>(container, ".ago-shell__rail-link", "Analytics");
    expect(ordinaryLink?.querySelector(".ago-badge")).toBeNull();

    await openSection(container, "Calendar");
    const mutedLink = one<HTMLAnchorElement>(container, ".ago-shell__rail-link.ago-shell__rail-link--muted");
    expect(mutedLink.querySelector(".ago-shell__nav-link-label")?.textContent).toBe("Waiting");
    expect(mutedLink.querySelector(".ago-badge")?.textContent).toBe("Add-on");
  });

  it("stays a real, keyboard-reachable link - never `disabled`, never `aria-disabled`", async () => {
    // The destination page is where the "buy this" explanation lives (`ProductsPage`), because this
    // console has no tooltip - a `disabled` control could not be reached to get there at all.
    grants(["site:configure"]);

    const container = await render(shellAt("/"));
    await openSection(container, "Calendar");

    const mutedLink = all(container, ".ago-shell__rail-link").find(
      (a) => a.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() === "Waiting",
    ) as HTMLAnchorElement | undefined;
    expect(mutedLink).not.toBeUndefined();
    expect(mutedLink?.hasAttribute("disabled")).toBe(false);
    expect(mutedLink?.getAttribute("aria-disabled")).toBeNull();
    expect(mutedLink?.tagName).toBe("A");
    expect(mutedLink?.getAttribute("href")).toBe("/calendar/waiting");
  });
});

/**
 * `11-14`. The claim `ago-root#317` names explicitly: the drawer and the rail must never be able to
 * disagree about what an operator may see, because they render from the same `sections` array
 * (`AppShell.tsx`'s own remarks) and the same lifted `openId` state, rather than each holding an
 * independent list or an independent idea of which section is open. An assertion that only checks
 * the *granted* case would pass even if the drawer ignored permissions entirely (a hardcoded,
 * always-everything list happens to match a fully-permitted operator too) - the under-permissioned
 * case below is the one that actually distinguishes "reads the filtered structure" from "reads
 * something else that merely looks right for this one operator".
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

  it("offers exactly three sections to an operator the server gave no tenant-level permission", async () => {
    // The drawer is a second renderer over the identical `sections` structure the rail uses
    // (`AppShell.tsx`'s own remarks) - this is the same fail-closed shape asserted through the
    // drawer's own markup rather than assumed from the rail's own tests above.
    grants(["conversation:read"]);

    const container = await render(shellAt("/"));
    await openDrawer(container);

    expect(sectionLabels(container, "drawer")).toEqual(["Conversations", "Analytics", "Team"]);
  });

  it("offers exactly what the rail offers, to an operator the server says holds site:configure", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));

    expect(sectionLabels(container, "rail")).toEqual(sectionLabels(container, "drawer"));

    await openDrawer(container);
    await openSection(container, "Calendar", "drawer");
    expect(itemLabels(container, "drawer")).toEqual(["Waiting"]);
    expect(mutedItemLabels(container, "drawer")).toEqual(["Waiting"]);
  });

  it("closes when an item is chosen", async () => {
    grants(["site:configure"]);

    // `shellAt` registers only one route (`path`, here `"/"`), matching every other test in this
    // file - clicking "Mine" (the one item that stays on `"/"`, already visible without opening a
    // section, since `/` is the active route and its own section opens by default) is what this
    // harness can observe; a real cross-route click is `mobileNavDrawer.spec.ts`'s job, against the
    // real router in a real browser (`AppShell`'s own doc comment on where the browser-only half of
    // this claim lives).
    const container = await render(shellAt("/"));
    await openDrawer(container);
    expect(drawerDialog(container).open).toBe(true);

    await interact(() => byText<HTMLAnchorElement>(container, ".ago-shell__drawer-nav a", "Mine")?.click());

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

    const container = await render(pageOnly("/conversations/all", <AdminConversationsPage />));

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

    const container = await render(pageOnly("/conversations/all", <AdminConversationsPage />));

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
    ["/conversations/all", <AdminConversationsPage key="admin" />],
    ["/channels/install", <InstallSnippetPage key="install" />],
    ["/channels/widget", <WidgetConfigPage key="widget" />],
    ["/automation/auto-reply", <OfflineAutoReplyPage key="auto-reply" />],
    ["/automation/canned", <CannedResponsesPage key="canned-responses" />],
    ["/automation/faq", <FaqModulePage key="faq" />],
    ["/account/device-storage", <DeviceStorageDisclosurePage key="device-storage" />],
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
    ["/conversations/all", <AdminConversationsPage key="admin" />],
    ["/channels/install", <InstallSnippetPage key="install" />],
    ["/channels/widget", <WidgetConfigPage key="widget" />],
    ["/automation/auto-reply", <OfflineAutoReplyPage key="auto-reply" />],
    ["/automation/canned", <CannedResponsesPage key="canned-responses" />],
    ["/automation/faq", <FaqModulePage key="faq" />],
    ["/account/device-storage", <DeviceStorageDisclosurePage key="device-storage" />],
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

    const container = await render(pageOnly("/conversations/all", <AdminConversationsPage />));

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

    const container = await render(pageOnly("/conversations/all", <AdminConversationsPage />));

    expect(container.querySelector(".ago-panel")).toBeNull();
  });

  it("says nothing either way while the permissions answer is in flight", async () => {
    // Refusing before the answer arrives would accuse every operator of lacking a permission they
    // may well hold, for as long as one HTTP round trip takes.
    operatorsApi.fetchMyPermissions.mockReturnValue(new Promise(() => undefined));

    const container = await render(pageOnly("/conversations/all", <AdminConversationsPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(container.textContent).toContain("Checking your permissions");
  });

  it("refuses the widget configuration form, and does not load the site's config", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/channels/widget", <WidgetConfigPage />));

    expect(container.textContent).toContain("You do not have permission to configure this site");
    expect(container.querySelector("form")).toBeNull();
    expect(widgetConfigApi.fetchWidgetConfig).not.toHaveBeenCalled();
  });

  it("renders the widget configuration form for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/channels/widget", <WidgetConfigPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(widgetConfigApi.fetchWidgetConfig).toHaveBeenCalledWith("token", SITE_ID);
    expect(byText(container, "button", "Save")).not.toBeNull();
  });

  /** `10-06`. */
  it("refuses the install screen, and does not load the site's installation details", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/channels/install", <InstallSnippetPage />));

    expect(container.textContent).toContain("You do not have permission to view this site's installation details.");
    expect(installationApi.fetchSiteInstallation).not.toHaveBeenCalled();
  });

  it("renders the install screen for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/channels/install", <InstallSnippetPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(installationApi.fetchSiteInstallation).toHaveBeenCalledWith("token", SITE_ID);
    expect(container.textContent).toContain("shop_7f3a");
  });

  /** `24-15`. Same shape as `/settings/install`/`/settings/widget` right above - the one difference
   * (no API to assert against, `DeviceStorageDisclosurePage`'s own doc comment has why) is why this
   * pair checks rendered content rather than a mock call. */
  it("refuses the device-storage disclosure page", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/account/device-storage", <DeviceStorageDisclosurePage />));

    expect(container.textContent).toContain("You do not have permission to view this page.");
    expect(container.querySelector("table")).toBeNull();
  });

  it("renders the device-storage disclosure page for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/account/device-storage", <DeviceStorageDisclosurePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(container.textContent).toContain("These are not cookies.");
  });

  it("refuses the canned-responses form, and does not load the site's library", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/automation/canned", <CannedResponsesPage />));

    expect(container.textContent).toContain("You do not have permission to configure this site's canned responses.");
    expect(container.querySelector("form")).toBeNull();
    expect(cannedResponsesApi.fetchCannedResponses).not.toHaveBeenCalled();
  });

  it("renders the canned-responses form for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/automation/canned", <CannedResponsesPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(cannedResponsesApi.fetchCannedResponses).toHaveBeenCalledWith("token", SITE_ID);
    expect(byText(container, "button", "Save")).not.toBeNull();
  });

  it("refuses the AI FAQ assistant screen, and does not load the site's modules", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/automation/faq", <FaqModulePage />));

    expect(container.textContent).toContain("You do not have permission to configure this site's AI FAQ assistant.");
    expect(container.querySelector("form")).toBeNull();
    expect(modulesApi.fetchModules).not.toHaveBeenCalled();
  });

  it("renders the AI FAQ assistant screen for an operator who holds the permission", async () => {
    grants(["site:configure"]);

    const container = await render(pageOnly("/automation/faq", <FaqModulePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(modulesApi.fetchModules).toHaveBeenCalledWith("token", SITE_ID);
    // `23-84`: this used to assert a Save button, which belonged to the module-registration form -
    // the knowledge-base panel renders its own "not configured" state here, because this file's
    // mocked `config.faqApiBaseUrl` is `null`. That form is gone (`23-83` removed the tenant-facing
    // write routes it called), so this screen now has **no** submit at all for a permitted operator,
    // and asserting its absence is the stronger statement about what a tenant may do.
    expect(container.querySelector("button[type='submit']")).toBeNull();
    expect(container.textContent).toContain("Not enabled on this account");
    expect(container.textContent).toContain("not configured for this deployment yet");
  });

  it("refuses the calendar booking queue on a tenant that has it, and does not load its data", async () => {
    // `22-06`/`adr/0093`: a distinct permission from `site:configure` - an operator holding that one
    // alone still sees no calendar screen, matching every other calendar-gated case in this file.
    // `23-21`: the tenant *does* have the module enabled here (`["calendar"]`) - the "forbidden", not
    // "absent", half of the distinction the item exists to draw. See the next test for the other half.
    grants(["site:configure"], ["calendar"]);

    const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

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

    const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

    expect(container.textContent).not.toContain("You do not have permission to view the calendar's booking queue.");
    expect(container.textContent).toContain("This workspace does not have the calendar.");
    expect(container.querySelector("table")).toBeNull();
    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
  });

  it("renders the calendar booking queue for an operator who holds calendar:configure", async () => {
    grants(["calendar:configure"]);

    const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(calendarApi.getPendingBookings).toHaveBeenCalledWith("token", expect.anything());
  });

  // `23-57`: `CalendarQueuePage`'s own gate now also accepts any one of the booking action
  // permissions, matching the branch `consoleNav.ts`'s `buildCalendarItems` draws the Waiting entry
  // from - a nav link the page underneath still refused would be the identical defect this item
  // exists to fix, seen from the other side.

  it("`23-57`: renders the calendar booking queue for an operator who holds booking:reject alone, without calendar:configure", async () => {
    grants(["booking:reject"]);

    const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(calendarApi.getPendingBookings).toHaveBeenCalledWith("token", expect.anything());
  });

  it("`23-57`: still refuses the queue to an operator who holds customer:read but none of the booking action permissions", async () => {
    // The two capabilities are checked independently, on both sides of this gate - holding one does
    // not imply the other, the same "a real subset" reasoning `hasAnyBookingActionPermission`'s own
    // doc comment gives. `["calendar"]` names the tenant as having the module, matching the "forbidden
    // on a tenant that has it" test above - `customer:read` alone says nothing about that.
    grants(["customer:read"], ["calendar"]);

    const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

    expect(container.textContent).toContain("You do not have permission to view the calendar's booking queue.");
    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
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
      const container = await render(pageOnly("/calendar/waiting", <CalendarQueuePage />));

      expect(container.textContent).toContain(
        "The calendar backend is not configured for this deployment yet, so this screen cannot be used here.",
      );
      expect(container.querySelector("table")).toBeNull();
      expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
    } finally {
      config.calendarApiBaseUrl = original;
    }
  });

  // `23-34`: `CalendarBookingsPage`'s own gate is `customer:read`, deliberately narrower than the
  // console-wide `calendar:configure` every other calendar screen above checks - see that page's own
  // doc comment. These four mirror the queue's own four immediately above, with the one permission
  // that actually gates this screen substituted in.

  it("refuses confirmed bookings to an operator who lacks customer:read, and does not load its data", async () => {
    grants(["site:configure"], ["calendar"]);

    const container = await render(pageOnly("/calendar/bookings", <CalendarBookingsPage />));

    expect(container.textContent).toContain("You do not have permission to view confirmed bookings.");
    expect(container.textContent).toContain("Ask an owner or admin at this workspace to grant it to you.");
    expect(container.querySelector("table")).toBeNull();
    expect(calendarApi.getConfirmedBookings).not.toHaveBeenCalled();
  });

  it("says confirmed bookings are not part of this workspace, when the tenant never enabled the calendar", async () => {
    grants(["site:configure"], []);

    const container = await render(pageOnly("/calendar/bookings", <CalendarBookingsPage />));

    expect(container.textContent).not.toContain("You do not have permission to view confirmed bookings.");
    expect(container.textContent).toContain("This workspace does not have the calendar.");
    expect(calendarApi.getConfirmedBookings).not.toHaveBeenCalled();
  });

  it("renders confirmed bookings for an operator who holds customer:read alone - the seeded Operator role's own shape, without calendar:configure", async () => {
    grants(["customer:read"]);

    const container = await render(pageOnly("/calendar/bookings", <CalendarBookingsPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(calendarApi.getConfirmedBookings).toHaveBeenCalledWith("token", expect.any(String), expect.any(String), expect.anything());
  });

  it("is absent, not broken, when calendarApiBaseUrl is unset", async () => {
    grants(["customer:read"]);
    const { config } = await import("../config.js");
    const original = config.calendarApiBaseUrl;
    config.calendarApiBaseUrl = null;

    try {
      const container = await render(pageOnly("/calendar/bookings", <CalendarBookingsPage />));

      expect(container.textContent).toContain(
        "The calendar backend is not configured for this deployment yet, so this screen cannot be used here.",
      );
      expect(container.querySelector("table")).toBeNull();
      expect(calendarApi.getConfirmedBookings).not.toHaveBeenCalled();
    } finally {
      config.calendarApiBaseUrl = original;
    }
  });

  // `23-57`: `CalendarContactsPage`'s own gate now also accepts `customer:read`, the same permission
  // `consoleNav.ts`'s `buildCalendarItems` draws the Contacts entry from - the identical
  // page-must-match-nav reasoning `23-34` already established for `CalendarBookingsPage` above,
  // applied to the second entry this item adds to that same operator branch.

  it("`23-57`: refuses contacts to an operator who lacks customer:read, and does not load its data", async () => {
    grants(["site:configure"], ["calendar"]);

    const container = await render(pageOnly("/calendar/clients", <CalendarContactsPage />));

    expect(container.textContent).toContain("You do not have permission to view the calendar's contacts.");
    expect(container.textContent).toContain("Ask an owner or admin at this workspace to grant it to you.");
    expect(container.querySelector("table")).toBeNull();
    expect(calendarApi.getContacts).not.toHaveBeenCalled();
  });

  it("`23-57`: says contacts are not part of this workspace, when the tenant never enabled the calendar", async () => {
    grants(["site:configure"], []);

    const container = await render(pageOnly("/calendar/clients", <CalendarContactsPage />));

    expect(container.textContent).not.toContain("You do not have permission to view the calendar's contacts.");
    expect(container.textContent).toContain("This workspace does not have the calendar.");
    expect(calendarApi.getContacts).not.toHaveBeenCalled();
  });

  it("`23-57`: renders contacts for an operator who holds customer:read alone - the seeded Operator role's own shape, without calendar:configure", async () => {
    grants(["customer:read"]);

    const container = await render(pageOnly("/calendar/clients", <CalendarContactsPage />));

    expect(container.textContent).not.toContain("You do not have permission");
    expect(calendarApi.getContacts).toHaveBeenCalledWith("token", expect.anything());
  });

  it("`23-57`: is absent, not broken, when calendarApiBaseUrl is unset", async () => {
    grants(["customer:read"]);
    const { config } = await import("../config.js");
    const original = config.calendarApiBaseUrl;
    config.calendarApiBaseUrl = null;

    try {
      const container = await render(pageOnly("/calendar/clients", <CalendarContactsPage />));

      expect(container.textContent).toContain(
        "The calendar backend is not configured for this deployment yet, so this screen cannot be used here.",
      );
      expect(container.querySelector("table")).toBeNull();
      expect(calendarApi.getContacts).not.toHaveBeenCalled();
    } finally {
      config.calendarApiBaseUrl = original;
    }
  });
});
