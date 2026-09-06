import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSiteDetailPage } from "./OwnerSiteDetailPage.js";
import type { OwnerSiteDetail, OwnerSiteModule } from "../api/ownerApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-14`: the per-tenant detail read's own behaviour tests - mirrors `ownerSitesPage.test.tsx`'s
 * setup (same mocked modules, same `Signed` wrapper), since this page is mounted the identical way.
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
const ownerApi = vi.hoisted(() => ({
  fetchOwnerSiteDetail: vi.fn(),
  // `23-48`: the allowed-origins editor's own write - mocked from the start (rather than added only
  // once a test needs it) so an unrelated test that never touches the editor cannot crash on an
  // unmocked import the way a bare `{}` factory would.
  updateOwnerSiteAllowedOrigins: vi.fn(),
}));
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
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function shellAt(siteId: string = SITE_ID) {
  return (
    <MemoryRouter initialEntries={[`/owner/sites/${siteId}`]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/sites/:siteId" element={<OwnerSiteDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function oneModule(overrides: Partial<OwnerSiteModule> = {}): OwnerSiteModule {
  return {
    moduleKey: "calendar",
    triggerWords: ["book-a-table"],
    entryPoint: "https://module.example.com/entry",
    grantedByOwner: true,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

function detail(overrides: Partial<OwnerSiteDetail> = {}): OwnerSiteDetail {
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
    recentWindowDays: 30,
    modules: [],
    allowedOrigins: ["https://shop.example"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
});

afterEach(async () => {
  await unmount();
});

describe("the site detail page's own access states", () => {
  it("renders the tenant's own facts once granted", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Demo Shop One");
    expect(container.textContent).toContain("free");
    expect(container.textContent).toContain(SITE_ID);
  });

  it("shows a refusal, not a table, when the server refuses", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not authorized");
    expect(container.querySelector("table")).toBeNull();
  });

  /** `23-14`'s own Done-when: a genuine 404, distinguishable from a refusal - the platform owner may
   * legitimately name a site that does not exist. */
  it("shows a real not-found state for a site id that does not exist", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-found" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("No such site");
    expect(container.textContent).not.toContain("Not authorized");
  });
});

describe("the site detail page's own entitlements table", () => {
  it("shows a module the owner granted, with its expiry", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({
            moduleKey: "calendar",
            grantedByOwner: true,
            expiresAt: "2026-12-31T00:00:00Z",
            isActive: true,
          }),
        ],
      }),
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("calendar");
    expect(container.textContent).toContain("Platform owner");
    expect(container.textContent).toContain("Active");
  });

  /** A module the tenant enabled must read differently from one the owner granted - never the same
   * label (this item's own Done-when). */
  it("distinguishes a tenant-granted module from an owner-granted one", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", grantedByOwner: true }),
          oneModule({ moduleKey: "faq", grantedByOwner: false }),
        ],
      }),
    });

    const container = await render(shellAt());

    const badges = all(container, "table .ago-badge").map((b) => (b.textContent ?? "").trim());
    expect(badges).toContain("Platform owner");
    expect(badges).toContain("Tenant");
  });

  /** A grant with no expiry renders as an explicit statement, never a blank cell. */
  it("renders a module with no expiry as an explicit 'No end date'", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ expiresAt: null })] }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("No end date");
  });

  /** The item's own most-emphasised Done-when: an expired grant is shown as expired, not omitted -
   * matching what the live read-store query already decided (`isActive: false`), never recomputed by
   * this page from `expiresAt` and the browser's own clock. */
  it("shows an expired grant as expired, not omitted from the list", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", expiresAt: "2020-01-01T00:00:00Z", isActive: false }),
        ],
      }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("calendar");
    expect(row.textContent).toContain("Expired");
  });

  it("states in words what an expiry does and does not do", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toMatch(/never told/i);
  });

  it("shows an empty-modules note rather than an empty table when the tenant holds none", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail({ modules: [] }) });

    const container = await render(shellAt());

    expect(container.textContent).toContain("no modules enabled");
    expect(container.querySelector("table")).toBeNull();
  });
});

// `23-48`: the platform owner's own editor - the only place a tenant's allowed origins can be
// changed. This suite is about the editor's own behaviour (what it shows, what it sends, how it
// reports success and refusal); it deliberately never asserts anything about the cache the write
// actually invalidates - that guarantee is proven end to end against real infrastructure in
// `Ago.Chat.Integration.Tests`' `SiteAllowedOriginsCacheInvalidationEndToEndTests`, not here.
describe("the site detail page's own allowed-origins editor", () => {
  it("shows the tenant's current allowed origins, one per line, in the editor", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://shop.example", "https://www.shop.example"] }),
    });

    const container = await render(shellAt());

    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://shop.example\nhttps://www.shop.example");
  });

  it("saves the edited list, and shows the server's own saved value back", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "ok",
      allowedOrigins: ["https://new.example"],
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://new.example");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    expect(ownerApi.updateOwnerSiteAllowedOrigins).toHaveBeenCalledWith("token", SITE_ID, ["https://new.example"]);
    expect(container.textContent).toMatch(/saved/i);
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://new.example");
  });

  /** Blank lines are a typing artifact, not a value the caller meant to send - dropped client-side
   * rather than bounced off the server's own "cannot be empty" guard for a line nobody meant as a
   * real entry. */
  it("drops blank lines before sending", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "ok",
      allowedOrigins: ["https://new.example"],
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://new.example\n\n  \n");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    expect(ownerApi.updateOwnerSiteAllowedOrigins).toHaveBeenCalledWith("token", SITE_ID, ["https://new.example"]);
  });

  /** Fails-before: before the editor read the server's own refusal text, a malformed origin would
   * have either thrown an unhandled error or shown nothing - `23-48`'s own Done-when is that the
   * refusal names what is wrong, not just that something went wrong. */
  it("shows the server's own refusal text inline, next to the field, for a malformed origin", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "invalid",
      message: "Allowed origin must not include a path, query string, or fragment.",
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://shop.example/booking");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    const alert = one<HTMLElement>(container, '[role="alert"]');
    expect(alert.textContent).toContain("path, query string, or fragment");
    // Nothing changed underneath the caller's own edit - a refusal must not quietly revert the
    // field to whatever the server last held.
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://shop.example/booking");
  });
});

const TEXTAREA_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

async function setTextarea(container: HTMLElement, value: string) {
  const textarea = one<HTMLTextAreaElement>(container, "textarea");
  await interact(() => {
    TEXTAREA_VALUE_DESCRIPTOR?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
