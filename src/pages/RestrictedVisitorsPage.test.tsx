import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { RestrictedVisitorsPage } from "./RestrictedVisitorsPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-69`/`23-77`'s own console screen - the tenant's "how many, by whom" read, and the reversal
 * action both items' own Scope requires. Mocking pattern mirrors `AdminConversationsPage.test.tsx`
 * exactly, its own closest sibling (a `site:configure`-gated, fetch-on-mount admin list).
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
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const visitorRestrictionsApi = vi.hoisted(() => ({
  fetchVisitorRestrictions: vi.fn(),
  liftVisitorRestriction: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/visitorRestrictionsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/visitorRestrictionsApi.js")>("../api/visitorRestrictionsApi.js");
  return { ...actual, ...visitorRestrictionsApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VISITOR_ID = "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <RestrictedVisitorsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function oneRestriction(overrides: Partial<Parameters<typeof visitorRestrictionsApi.fetchVisitorRestrictions>[0]> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    visitorId: VISITOR_ID,
    kind: "Spam" as const,
    restrictedAt: "2026-01-01T12:00:00Z",
    restrictedBy: "oooooooo-oooo-oooo-oooo-oooooooooooo",
    // Far enough in the future that `RestrictedVisitorsPage`'s own `statusOf(row, new Date())` reads
    // this row as active regardless of when this test actually runs - the component reads the real
    // clock directly (no injected `IClock` the way the backend has), so the fixture has to outlive
    // the test suite's own lifetime rather than the test controlling time itself.
    expiresAt: "2099-01-02T12:00:00Z",
    sourceConversationId: "22222222-2222-2222-2222-222222222222",
    liftedAt: null,
    liftedBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  visitorRestrictionsApi.fetchVisitorRestrictions.mockResolvedValue({ items: [oneRestriction()], nextBeforeId: null });
  visitorRestrictionsApi.liftVisitorRestriction.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("lists an active restriction for an operator holding site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain(VISITOR_ID.slice(0, 8));
    expect(container.textContent).toContain("Closed as spam");
  });

  it("refuses an operator without site:configure, without ever calling the read", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["conversation:read"], siteId: SITE_ID });

    const container = await render(page());

    expect(visitorRestrictionsApi.fetchVisitorRestrictions).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(VISITOR_ID.slice(0, 8));
  });
});

describe("lifting a restriction", () => {
  it("offers Lift for an active row to an operator holding conversation:mark_spam", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:mark_spam"],
      siteId: SITE_ID,
    });

    const container = await render(page());

    expect(byText(container, "button", "Lift")).not.toBeNull();
  });

  it("does not offer Lift to an operator holding neither conversation:mark_spam nor conversation:block", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(page());

    expect(byText(container, "button", "Lift")).toBeNull();
  });

  it("does not offer Lift for an already-lifted row", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:block"],
      siteId: SITE_ID,
    });
    visitorRestrictionsApi.fetchVisitorRestrictions.mockResolvedValue({
      items: [oneRestriction({ liftedAt: "2026-01-01T13:00:00Z", liftedBy: "oooooooo-oooo-oooo-oooo-oooooooooooo" })],
      nextBeforeId: null,
    });

    const container = await render(page());

    expect(container.textContent).toContain("Lifted");
    expect(byText(container, "button", "Lift")).toBeNull();
  });

  it("lifts the restriction and re-loads the list on success", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:mark_spam"],
      siteId: SITE_ID,
    });
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Lift").click());

    expect(visitorRestrictionsApi.liftVisitorRestriction).toHaveBeenCalledWith("token", VISITOR_ID);
    expect(visitorRestrictionsApi.fetchVisitorRestrictions).toHaveBeenCalledTimes(2);
  });

  it("shows an error and leaves the row alone when the lift fails", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:mark_spam"],
      siteId: SITE_ID,
    });
    visitorRestrictionsApi.liftVisitorRestriction.mockRejectedValue(new Error("boom"));
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Lift").click());

    expect(container.textContent).toContain("Could not lift this restriction");
    expect(byText(container, "button", "Lift")).not.toBeNull();
  });
});

describe("the empty state", () => {
  it("says nobody is restricted, rather than an empty table", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
    visitorRestrictionsApi.fetchVisitorRestrictions.mockResolvedValue({ items: [], nextBeforeId: null });

    const container = await render(page());

    expect(container.textContent).toContain("No visitor has been muted or blocked");
    expect(all(container, "table")).toHaveLength(0);
  });
});
