import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { DeviceStorageDisclosurePage } from "./DeviceStorageDisclosurePage.js";
import { DEVICE_STORAGE_DISCLOSURE_ROWS } from "./deviceStorageDisclosure.js";
import { en } from "../i18n/en.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `24-15`. The gate itself (`site:configure`, permission-still-loading, refused/allowed) is already
 * covered by `permissionGating.test.tsx`'s own shared table and is not repeated here - this file is
 * the screen's own content, on the identical split `InstallSnippetPage.test.tsx` already draws.
 *
 * Unlike every settings screen beside it, this one fetches nothing (`DeviceStorageDisclosurePage`'s
 * own doc comment has the reasoning), so there is no per-site API to mock beyond the permission
 * plumbing `PermissionsProvider` itself always calls.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

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

function page(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <DeviceStorageDisclosurePage />
      </PermissionsProvider>
    </Signed>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("the device-storage disclosure screen", () => {
  it("states plainly that these are not cookies", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("These are not cookies.");
  });

  it("lists every documented key by name", async () => {
    const container = await render(page());
    const body = container.textContent ?? "";

    for (const row of DEVICE_STORAGE_DISCLOSURE_ROWS) {
      expect(body).toContain(row.key);
    }
  });

  it("gives every documented row a real lifetime, in the console's own words", async () => {
    const container = await render(page());
    const body = container.textContent ?? "";

    // `en.ts` is the source of truth for what each row's lifetime text actually says - reading it
    // back through the rendered page keeps this test honest against a row whose `lifetimeKey` points
    // at the wrong string entirely, not only against a blank one.
    for (const row of DEVICE_STORAGE_DISCLOSURE_ROWS) {
      const lifetimeText = en[row.lifetimeKey];
      expect(lifetimeText.length).toBeGreaterThan(0);
      expect(body).toContain(lifetimeText);
    }
  });

  it("states the visitor-token row's honest lifetime - renewed at use, and nothing clears it if the visitor never returns", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("nothing clears the stored value");
  });

  it("says AGO cannot reach this store to erase it on request", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("we cannot reach it to delete it on request");
  });
});

// The `site:configure` gate itself (denied, still-loading, and the `<Link>`-bearing refusal screen,
// which needs a real router this file's own bare `page()` harness does not provide) is
// `permissionGating.test.tsx`'s shared table, matching `InstallSnippetPage.test.tsx`'s identical
// split - see that file's own doc comment.
