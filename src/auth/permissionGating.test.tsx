import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "./AuthContext.js";
import { PermissionsProvider } from "./PermissionsProvider.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { AdminConversationsPage } from "../pages/AdminConversationsPage.js";
import { WidgetConfigPage } from "../pages/WidgetConfigPage.js";
import { OfflineAutoReplyPage } from "../pages/OfflineAutoReplyPage.js";
import { all, byText, render, unmount } from "../testing/dom.js";

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
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const conversationsApi = vi.hoisted(() => ({ fetchAllConversationsForSite: vi.fn() }));
const widgetConfigApi = vi.hoisted(() => ({ fetchWidgetConfig: vi.fn(), updateWidgetConfig: vi.fn() }));
const offlineAutoReplyApi = vi.hoisted(() => ({ fetchOfflineAutoReply: vi.fn(), updateOfflineAutoReply: vi.fn() }));
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
vi.mock("../api/offlineAutoReplyApi.js", async () => {
  // Same reasoning as widgetConfigApi.js above - OfflineAutoReplyError is a real class the page
  // does `instanceof` against.
  const actual =
    await vi.importActual<typeof import("../api/offlineAutoReplyApi.js")>("../api/offlineAutoReplyApi.js");
  return { ...actual, ...offlineAutoReplyApi };
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

function grants(permissions: string[]): void {
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions, siteId: SITE_ID });
}

function navLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__nav a").map((link) => (link.textContent ?? "").trim());
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
  offlineAutoReplyApi.fetchOfflineAutoReply.mockResolvedValue({ enabled: false, fallbackReply: "", rules: [] });
});

afterEach(async () => {
  await unmount();
});

describe("the operator navigation", () => {
  it("does not offer the site-wide sections to an operator the server gave no site:configure", async () => {
    grants(["conversation:read"]);

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toEqual(["Conversations"]);
  });

  it("offers them to an operator the server says holds site:configure", async () => {
    grants(["site:configure"]);

    const container = await render(shellAt("/"));

    expect(navLabels(container)).toEqual([
      "Conversations",
      "All conversations",
      "Widget appearance",
      "Offline auto-reply",
    ]);
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
      "Widget appearance",
      "Offline auto-reply",
      "Platform sites",
    ]);
  });

  it("does not offer the platform-owner section while the probe is unanswered", async () => {
    ownerApi.probeOwnerEligibility.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(navLabels(container)).not.toContain("Platform sites");
  });
});

describe("a gated page reached directly by URL", () => {
  it("refuses the site-wide conversation list, and does not even ask the server for it", async () => {
    grants(["conversation:read"]);

    const container = await render(pageOnly("/admin", <AdminConversationsPage />));

    expect(container.textContent).toContain("You do not have permission to view every conversation for this site.");
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
    ["/settings/widget", <WidgetConfigPage key="widget" />],
    ["/settings/auto-reply", <OfflineAutoReplyPage key="auto-reply" />],
  ])("renders %s in the shell's full width, the same as the workspace routes", async (path, page) => {
    grants(["site:configure"]);

    const container = await render(shellAt(path, page));

    expect(container.querySelector(".ago-shell")?.classList.contains("ago-shell--fixed")).toBe(true);
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
});
