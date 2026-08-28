import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { AccountDeletionPage, SITE_ERASE_PERMISSION } from "./AccountDeletionPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `16-02`: `/settings/delete-account`. Modeled on `WidgetConfigPage.test.tsx`/`permissionGating.test.tsx`
 * for the permission-gated-page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me`
 * faked), plus this item's own new part: a `202` from `eraseSite` must not read as done, and `logout()`
 * must fire only once the poll actually observes completion.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn(), checkOperatorErasure: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const sitesApi = vi.hoisted(() => ({ eraseSite: vi.fn() }));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/sitesApi.js", async () => {
  // `ApiProblemError`-throwing failure paths construct the real class from `problemDetails.js`
  // (unmocked, via `../api/sitesApi.js`'s own `eraseSite` in the failure test below), the same "only
  // replace the network call" shape `WidgetConfigPage.test.tsx` already uses for `widgetConfigApi.js`.
  const actual = await vi.importActual<typeof import("../api/sitesApi.js")>("../api/sitesApi.js");
  return { ...actual, ...sitesApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ logout, children }: { logout: () => Promise<void>; children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout }),
    [logout],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` for the same reason `permissionGating.test.tsx`'s `pageOnly` is - the
 * permission-refusal branch renders a `<Link to="/">`, which throws outside a router context. */
function page(logout: () => Promise<void>): ReactNode {
  return (
    <MemoryRouter>
      <Signed logout={logout}>
        <PermissionsProvider>
          <AccountDeletionPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function confirmButton(container: ParentNode): HTMLButtonElement {
  const button = byText<HTMLButtonElement>(container, "button", "Delete it");
  if (button === null) {
    throw new Error("the confirmation dialog has no destructive action");
  }

  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [SITE_ERASE_PERMISSION], siteId: SITE_ID });
  operatorsApi.checkOperatorErasure.mockResolvedValue("pending");
  sitesApi.eraseSite.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:erase, and never calls eraseSite", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page(() => Promise.resolve()));

    expect(container.textContent).toContain("You do not have permission to delete this account.");
    expect(byText(container, "button", "Delete this account")).toBeNull();
  });

  it("offers it to an operator holding site:erase", async () => {
    const container = await render(page(() => Promise.resolve()));

    expect(byText(container, "button", "Delete this account")).not.toBeNull();
  });
});

describe("the confirmation", () => {
  it("does not call eraseSite until the destructive click is confirmed", async () => {
    const container = await render(page(() => Promise.resolve()));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete this account").click());

    expect(sitesApi.eraseSite).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("cannot be undone");
  });
});

describe("after a confirmed deletion starts (the 202 case)", () => {
  it("shows a persistent in-progress state, never a completed one, and does not sign out yet", async () => {
    const logout = vi.fn(() => Promise.resolve());
    const container = await render(page(logout));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete this account").click());
    await interact(() => confirmButton(container).click());

    expect(sitesApi.eraseSite).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Deletion in progress");
    // The button/form is gone - there is nothing left to interact with on this screen once erasing.
    expect(byText(container, "button", "Delete this account")).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it("signs out only once the poll actually observes the operator's own row is gone", async () => {
    const logout = vi.fn(() => Promise.resolve());
    const container = await render(page(logout));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete this account").click());
    await interact(() => confirmButton(container).click());
    expect(logout).not.toHaveBeenCalled();

    operatorsApi.checkOperatorErasure.mockResolvedValue("erased");
    await vi.advanceTimersByTimeAsync(3000);

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("does not sign out while the poll only ever reports unknown - a dropped connection is not completion", async () => {
    operatorsApi.checkOperatorErasure.mockResolvedValue("unknown");
    const logout = vi.fn(() => Promise.resolve());
    const container = await render(page(logout));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete this account").click());
    await interact(() => confirmButton(container).click());
    await vi.advanceTimersByTimeAsync(9000);

    expect(logout).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Deletion in progress");
  });
});

describe("when starting the deletion itself fails", () => {
  it("shows an error and stays on the form, not the in-progress state", async () => {
    sitesApi.eraseSite.mockRejectedValue(new Error("network down"));
    const container = await render(page(() => Promise.resolve()));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete this account").click());
    await interact(() => confirmButton(container).click());

    expect(container.textContent).toContain("Failed to start deleting this account.");
    expect(container.textContent).not.toContain("Deletion in progress");
  });
});
