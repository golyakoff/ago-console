import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ProductsPage, PRODUCTS_PERMISSION } from "./ProductsPage.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `23-25`: `/settings/products`. Modeled on `BillingPage.test.tsx` for the permission-gated-page
 * shape (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked) - this screen makes no
 * write and no second fetch, so there is nothing here `BillingPage.test.tsx`'s own checkout/poll
 * machinery needed.
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
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

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

/** Wrapped in a `MemoryRouter` for the same reason `BillingPage.test.tsx`'s `page` is - both the
 * permission-refusal branch and every held row's action cell render a `<Link>`, which throws outside
 * a router context. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <ProductsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID, enabledModules: [] });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's products.");
    // Nothing from the product rows leaks into the refusal - there is no table at all.
    expect(container.querySelector(".ago-table-scroll")).toBeNull();
  });

  it("offers it to an operator holding site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [PRODUCTS_PERMISSION], siteId: SITE_ID, enabledModules: [] });

    const container = await render(page());

    expect(container.querySelector(".ago-table-scroll")).not.toBeNull();
  });
});

describe("held versus not held", () => {
  it("marks the base product held, and links to the queue - it is always true for a signed-in operator", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [PRODUCTS_PERMISSION], siteId: SITE_ID, enabledModules: [] });

    const container = await render(page());

    const conversationsLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "Open your conversations",
    );
    expect(conversationsLink?.getAttribute("href")).toBe("/");
  });

  it("marks a product in enabledModules as held, with a link to where it is used", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: [PRODUCTS_PERMISSION],
      siteId: SITE_ID,
      enabledModules: ["calendar"],
    });

    const container = await render(page());

    const bookingLink = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Open your booking queue");
    expect(bookingLink?.getAttribute("href")).toBe("/calendar");
    expect(container.textContent).toContain("You have this");
  });

  it("offers only 'contact AGO', never a link, for a product not in enabledModules", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: [PRODUCTS_PERMISSION],
      siteId: SITE_ID,
      enabledModules: [],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Contact AGO to add this to your workspace.");
    expect(container.textContent).toContain("Not yet");
    // No link anywhere claims to enable a product this workspace does not have - the two links on
    // the page (the base product's, "Open your conversations") is the only anchor present when
    // nothing else is held.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/"]);
  });

  it("never shows a raw module key - the copy names what the product does, not its schema value", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: [PRODUCTS_PERMISSION],
      siteId: SITE_ID,
      enabledModules: ["calendar", "faq"],
    });

    const container = await render(page());

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bcalendar\b/i);
    expect(text).not.toMatch(/\bfaq\b/i);
  });

  it("names no price anywhere on the screen", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [PRODUCTS_PERMISSION], siteId: SITE_ID, enabledModules: [] });

    const container = await render(page());

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[₽$€]/);
  });
});
