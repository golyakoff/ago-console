import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { CallbackPage } from "../pages/CallbackPage.js";
import { SignupPage } from "../pages/SignupPage.js";
import { OnboardingPage } from "../pages/OnboardingPage.js";
import { RedeemInvitePage } from "../pages/RedeemInvitePage.js";
import { PreSessionStringsProvider } from "./PreSessionStringsProvider.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `23-28`'s own Done-when: "all four routes render in the reader's language under that choice."
 * The choice, recorded in `docs/backlog/23-28-*.md` and restated in `StringsContext.tsx`'s own doc
 * comment, is that the *absence* of a site means Russian, not English - so this is the console-side
 * proof, the same "assert rendered text through a real component, never a config value in isolation"
 * bar `consoleLocale.test.tsx` already set for `11-11`/`23-24`.
 *
 * Each page here is mounted exactly as `App.tsx` mounts it - wrapped in `PreSessionStringsProvider`,
 * nothing more - rather than through a bare `<StringsProvider value={ru}>`, so a regression that
 * moves the wrapping in `App.tsx` itself (not just in `StringsContext.tsx`) would show up here too.
 * `CallbackPage.test.tsx`/`SignupPage.test.tsx`/`OnboardingPage.test.tsx`/`RedeemInvitePage.test.tsx`
 * each mount their page bare (no provider at all), which is deliberately left unchanged by this item -
 * see `StringsContext.tsx`'s own doc comment for why the bare default stays `en`: those files are
 * therefore the proof that the *safety net* other callers (chiefly `/owner`) rely on did not move.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const userManager = vi.hoisted(() => ({
  userManager: { signinRedirectCallback: vi.fn() },
  keycloakRegistrationRedirect: vi.fn(),
}));
const operatorsApi = vi.hoisted(() => ({ resolveOperatorState: vi.fn(), fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn(), fetchOwnerSites: vi.fn() }));
const sitesApi = vi.hoisted(() => ({ registerSite: vi.fn() }));
const operatorInvitesApi = vi.hoisted(() => ({ redeemOperatorInvite: vi.fn() }));

vi.mock("../auth/userManager.js", () => userManager);
vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/sitesApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/sitesApi.js")>("../api/sitesApi.js");
  return { ...actual, ...sitesApi };
});
vi.mock("../api/operatorInvitesApi.js", () => operatorInvitesApi);

function signedIn(): User {
  return { access_token: "keycloak-token", profile: { sub: "keycloak-sub" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  // Never resolves - `/callback`'s spinner state is the one this suite cares about (its two error
  // states are already `CallbackPage.test.tsx`'s job, and both go through the identical `strings.*`
  // fields this file's `/callback` test below already exercises via the title).
  userManager.userManager.signinRedirectCallback.mockReturnValue(new Promise(() => undefined));
});

afterEach(async () => {
  await unmount();
});

describe("pre-session pages, wrapped exactly as App.tsx wraps them (23-28)", () => {
  it("/callback renders Russian with no site to read a locale from", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/callback"]}>
        <PreSessionStringsProvider>
          <Routes>
            <Route path="/callback" element={<CallbackPage />} />
          </Routes>
        </PreSessionStringsProvider>
      </MemoryRouter>,
    );

    expect(container.querySelector("[role='status']")?.textContent).toBe("Завершаем вход…");
    expect(container.textContent).not.toContain("Completing sign-in");
  });

  it("/signup renders Russian with no session at all", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/signup"]}>
        <PreSessionStringsProvider>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </PreSessionStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Регистрация в AGO Chat");
    expect(container.querySelector("button")?.textContent).toBe("Зарегистрироваться");
    expect(container.textContent).not.toContain("Sign up for AGO Chat");
  });

  it("/onboarding renders Russian, including client-side validation messages", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Signed>
          <PreSessionStringsProvider>
            <Routes>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Routes>
          </PreSessionStringsProvider>
        </Signed>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Завершите настройку своего сайта");
    expect(container.querySelector("button[type='submit']")?.textContent).toBe("Завершить настройку");
    expect(container.textContent).toContain("Активировать его здесь");
    expect(container.textContent).not.toContain("Finish setting up your site");

    // `23-46`: the address example, which is the one thing on this form a person has to *invent*
    // rather than choose. It is a translated string now, and this is the assertion that made it worth
    // being one: a Russian form showing `.com` reads as somebody else's example rather than a shape to
    // copy. The scheme is the part that actually matters - an origin without one never matches, so a
    // field that leaves the reader guessing produces a widget that silently never connects.
    const address = container.querySelector<HTMLInputElement>("input[placeholder]");
    expect(address?.placeholder).toBe("https://your.site.ru");
  });

  it("/redeem-invite renders Russian - the exact screen `ux-gate` used to exempt by name", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/redeem-invite"]}>
        <Signed>
          <PreSessionStringsProvider>
            <Routes>
              <Route path="/redeem-invite" element={<RedeemInvitePage />} />
            </Routes>
          </PreSessionStringsProvider>
        </Signed>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Активировать код приглашения");
    expect(container.querySelector("button[type='submit']")?.textContent).toBe("Активировать код");
    expect(container.textContent).not.toContain("Redeem an invite code");
  });
});
