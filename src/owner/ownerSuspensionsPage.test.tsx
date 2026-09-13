import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSuspensionsPage } from "./OwnerSuspensionsPage.js";
import type { OwnerSuspension } from "../api/ownerApi.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `22-08`/`adr/0166`: the console's own "who is currently suspended" screen - mirrors
 * `ownerPricingPage.test.tsx`'s setup (the identical mocked modules, the identical `Signed`
 * wrapper), since this page is mounted and gated the identical way.
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
  fetchOwnerSuspensions: vi.fn(),
  extendOwnerSuspension: vi.fn(),
  unblockOwnerSuspension: vi.fn(),
}));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

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

function shellAt() {
  return (
    <MemoryRouter initialEntries={["/owner/suspensions"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/suspensions" element={<OwnerSuspensionsPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function oneSuspension(overrides: Partial<OwnerSuspension> = {}): OwnerSuspension {
  return {
    siteId: SITE_ID,
    siteName: "Demo Shop One",
    suspendedUntil: "2099-01-01T00:00:00Z",
    lastActionBy: "owner-sub",
    lastActionReason: "Suspected chargeback fraud",
    lastActionAt: "2026-09-13T00:00:00Z",
    ...overrides,
  };
}

const TEXTAREA_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

async function setTextarea(container: HTMLElement, value: string) {
  const textarea = one<HTMLTextAreaElement>(container, "textarea");
  await interact(() => {
    TEXTAREA_VALUE_DESCRIPTOR?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function setInput(input: HTMLInputElement, value: string) {
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
});

afterEach(async () => {
  await unmount();
});

describe("the suspended-accounts page's own read", () => {
  it("shows an empty note rather than an empty table when nobody is suspended", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "ok", suspensions: [] });

    const container = await render(shellAt());

    expect(container.textContent).toMatch(/no accounts are currently suspended/i);
  });

  it("lists a suspended site with its own deadline and most recent act", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "ok", suspensions: [oneSuspension()] });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Demo Shop One");
    expect(container.textContent).toContain("owner-sub");
    expect(container.textContent).toContain("Suspected chargeback fraud");
  });

  it("shows a refusal, not a table, when the server refuses", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toMatch(/not authorized/i);
  });
});

describe("the suspended-accounts page's own actions", () => {
  it("extends by the additional minutes typed", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "ok", suspensions: [oneSuspension()] });
    ownerApi.extendOwnerSuspension.mockResolvedValue({ status: "ok", suspendedUntil: "2099-01-01T01:00:00Z" });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Extend").click());
    const dialog = one<HTMLElement>(container, "dialog[open]");

    await setInput(one<HTMLInputElement>(dialog, 'input[type="number"]'), "20");
    await setTextarea(dialog, "Still under review.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Extend").click());

    expect(ownerApi.extendOwnerSuspension).toHaveBeenCalledWith("token", SITE_ID, 20, "Still under review.");
  });

  it("unblocks with the typed reason, reloading the list afterward", async () => {
    ownerApi.fetchOwnerSuspensions
      .mockResolvedValueOnce({ status: "ok", suspensions: [oneSuspension()] })
      .mockResolvedValueOnce({ status: "ok", suspensions: [] });
    ownerApi.unblockOwnerSuspension.mockResolvedValue({ status: "ok" });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Unblock").click());
    const dialog = one<HTMLElement>(container, "dialog[open]");

    await setTextarea(dialog, "False alarm, resolved.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Unblock").click());

    expect(ownerApi.unblockOwnerSuspension).toHaveBeenCalledWith("token", SITE_ID, "False alarm, resolved.");
    expect(ownerApi.fetchOwnerSuspensions).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own conflict text without closing the dialog", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "ok", suspensions: [oneSuspension()] });
    ownerApi.unblockOwnerSuspension.mockResolvedValue({
      status: "conflict",
      message: "Site is not currently suspended.",
    });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Unblock").click());
    const dialog = one<HTMLElement>(container, "dialog[open]");
    await setTextarea(dialog, "Some reason.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Unblock").click());

    expect(dialog.textContent).toContain("Site is not currently suspended.");
  });
});
