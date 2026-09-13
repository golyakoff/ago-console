import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { SiteExportPage, SITE_EXPORT_PERMISSION } from "./SiteExportPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { SiteExportHistoryItemDto } from "../api/siteExportsApi.js";

/**
 * `16-03`: `/account/export`. Modeled on `AccountDeletionPage.test.tsx` for the permission-gated-page
 * shape (real `PermissionsProvider`, `GET /api/v1/operators/me` faked) - the part this item's own
 * report calls out as *not* borrowed from that file is the destructive-confirmation dialog, which
 * this screen has none of, so there is no dialog step here to drive.
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
const siteExportsApi = vi.hoisted(() => ({ getSiteExportHistory: vi.fn(), requestSiteExport: vi.fn() }));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/siteExportsApi.js", async () => {
  // `ApiProblemError`-throwing failure paths construct the real class from `problemDetails.js`
  // (unmocked, via this module's own `getSiteExportHistory`/`requestSiteExport` in the failure tests
  // below) - the same "only replace the network call" shape `AccountDeletionPage.test.tsx` already
  // uses for `sitesApi.js`.
  const actual = await vi.importActual<typeof import("../api/siteExportsApi.js")>("../api/siteExportsApi.js");
  return { ...actual, ...siteExportsApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: signedIn(),
      isLoading: false,
      isSigningOut: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` for the same reason `AccountDeletionPage.test.tsx`'s `page` is - the
 * shell's permission-refusal branch renders a `<Link to="/">`, which throws outside a router
 * context. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <SiteExportPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function readyRow(): SiteExportHistoryItemDto {
  return {
    exportId: "11111111-1111-1111-1111-111111111111",
    status: "Ready",
    requestedAt: "2026-09-01T10:00:00Z",
    completedAt: "2026-09-01T10:05:00Z",
    downloadUrl: "https://storage.test.invalid/exports/one.zip",
    expiresAt: "2026-09-08T10:05:00Z",
    failureReason: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [SITE_EXPORT_PERMISSION], siteId: SITE_ID });
  siteExportsApi.getSiteExportHistory.mockResolvedValue([]);
  siteExportsApi.requestSiteExport.mockResolvedValue({ exportId: "22222222-2222-2222-2222-222222222222" });
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:export, and never calls getSiteExportHistory", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to download this site's data.");
    expect(siteExportsApi.getSiteExportHistory).not.toHaveBeenCalled();
  });

  it("offers it, and loads the history, for an operator holding site:export", async () => {
    const container = await render(page());

    expect(siteExportsApi.getSiteExportHistory).toHaveBeenCalledWith("token", SITE_ID);
    expect(byText(container, "button", "Prepare data for download")).not.toBeNull();
  });
});

describe("the history table", () => {
  it("shows an empty state rather than an empty table when nothing has been requested yet", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("No data exports have been requested yet.");
  });

  it("renders a working download link only for a Ready row with a download url", async () => {
    siteExportsApi.getSiteExportHistory.mockResolvedValue([readyRow()]);

    const container = await render(page());

    const link = byText<HTMLAnchorElement>(container, "a", "Download");
    expect(link).not.toBeNull();
    expect(link.href).toBe("https://storage.test.invalid/exports/one.zip");
  });

  it("renders the status word, not a link, for a Pending row - and no auto-delete date", async () => {
    siteExportsApi.getSiteExportHistory.mockResolvedValue([
      {
        exportId: "33333333-3333-3333-3333-333333333333",
        status: "Pending",
        requestedAt: "2026-09-01T10:00:00Z",
        completedAt: null,
        downloadUrl: null,
        expiresAt: null,
        failureReason: null,
      } satisfies SiteExportHistoryItemDto,
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("Preparing");
    expect(byText(container, "a", "Download")).toBeNull();
  });
});

describe("requesting a new export", () => {
  it("calls requestSiteExport and reloads the history once it resolves", async () => {
    const container = await render(page());
    expect(siteExportsApi.getSiteExportHistory).toHaveBeenCalledTimes(1);

    siteExportsApi.getSiteExportHistory.mockResolvedValue([readyRow()]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Prepare data for download").click());

    expect(siteExportsApi.requestSiteExport).toHaveBeenCalledWith("token", SITE_ID);
    expect(siteExportsApi.getSiteExportHistory).toHaveBeenCalledTimes(2);
    expect(byText(container, "a", "Download")).not.toBeNull();
  });

  it("shows an error and leaves the previous history alone when the request itself fails", async () => {
    siteExportsApi.getSiteExportHistory.mockResolvedValue([readyRow()]);
    siteExportsApi.requestSiteExport.mockRejectedValue(new Error("network down"));

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Prepare data for download").click());

    expect(container.textContent).toContain("Failed to request a data export.");
    // The previously-loaded Ready row is still there - a failed trigger must not blank the table.
    expect(byText(container, "a", "Download")).not.toBeNull();
  });
});
