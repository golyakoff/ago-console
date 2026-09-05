import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { RedeemInvitePage } from "./RedeemInvitePage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-27`: the other end of `13-01`'s invite - `POST /api/v1/operator-invites/redeem`, reached by a
 * signed-in identity that is not yet an operator on any site. What is worth testing is not the form's
 * markup but the two things the backlog item names as easy to get wrong: that the handler's five
 * distinct outcomes (the backlog's own headline four, plus the two `RedeemOperatorInviteHandler` adds
 * - `AlreadyOperatorOnSite`, `SeatLimitReached`) each reach the reader as their own sentence rather
 * than one generic failure, and that the navigation after a real success reflects the newly-granted
 * permission with no reload - a claim a bare `<p>the queue</p>` destination (`OnboardingPage.test.tsx`'s
 * own shape) could not actually prove, so this file mounts the real `PermissionsProvider` at `/`
 * instead.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorInvitesApi = vi.hoisted(() => ({ redeemOperatorInvite: vi.fn() }));
const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorInvitesApi.js", () => operatorInvitesApi);
vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

function signedIn(): User {
  return { access_token: "keycloak-token", profile: { sub: "invited-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** The destination `/` actually resolves to once a redemption succeeds - `PermissionsProvider`
 * mounted fresh, exactly as `App.tsx`'s real layout route does, reading back whatever the (mocked)
 * server now says about this identity. Rendering `permissions`/`hasPermission` here, not a fixed
 * string, is what makes "reflects the newly-granted permission without a manual reload" an assertion
 * about real provider state rather than about a route having changed at all. */
function QueueProbe() {
  const { permissions } = usePermissions();
  if (permissions === null) {
    return <p>loading the queue…</p>;
  }

  return <p>the queue - can configure: {String(permissions.includes("site:configure"))}</p>;
}

function app() {
  return (
    <MemoryRouter initialEntries={["/redeem-invite"]}>
      <Signed>
        <Routes>
          <Route path="/redeem-invite" element={<RedeemInvitePage />} />
          <Route
            path="/"
            element={
              <PermissionsProvider>
                <QueueProbe />
              </PermissionsProvider>
            }
          />
          <Route path="/onboarding" element={<p>set up your own site</p>} />
        </Routes>
      </Signed>
    </MemoryRouter>
  );
}

function fillCode(container: HTMLElement, code: string): Promise<void> {
  return interact(() => {
    const input = one<HTMLInputElement>(container, "input");
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(container: HTMLElement): Promise<void> {
  return interact(() => one<HTMLFormElement>(container, "form").requestSubmit());
}

beforeEach(() => {
  vi.clearAllMocks();
  // A freshly-redeemed identity now has exactly one tenancy - the site the invite was for - and
  // `operators/me` answers with the permission the invite's own role carried. Neither value is read
  // by the "distinct error message" tests below; they matter only to the one test that follows the
  // redirect through to a real `PermissionsProvider` mount.
  tenanciesApi.fetchMyTenancies.mockResolvedValue({
    tenancies: [{ siteId: "11111111-1111-1111-1111-111111111111", siteName: "Kim's shop" }],
  });
  operatorsApi.fetchMyPermissions.mockResolvedValue({
    operatorId: "22222222-2222-2222-2222-222222222222",
    siteId: "11111111-1111-1111-1111-111111111111",
    permissions: ["site:configure"],
    locale: "En",
  });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("a valid code", () => {
  it("turns the signed-in identity into an operator, and the queue reflects it without a reload", async () => {
    vi.useFakeTimers();
    operatorInvitesApi.redeemOperatorInvite.mockResolvedValue({
      operatorId: "22222222-2222-2222-2222-222222222222",
      siteId: "11111111-1111-1111-1111-111111111111",
    });

    const container = await render(app());

    await fillCode(container, "kims-shop-invite-code");
    await submit(container);

    expect(operatorInvitesApi.redeemOperatorInvite).toHaveBeenCalledWith("keycloak-token", {
      code: "kims-shop-invite-code",
    });
    // The happy path's own distinct message - not a bare "success", and not the destination text
    // yet, because the redirect has not fired.
    expect(container.textContent).toContain("You're in. Taking you to your queue…");
    expect(container.textContent).not.toContain("the queue - can configure");

    // The redirect fires only after the message has had a moment to be read - see
    // `RedeemInvitePage.tsx`'s own doc comment. Advancing past it is what actually exercises the
    // "no manual reload" claim: nothing here calls `location.reload()` or re-mounts the app from
    // scratch, yet the destination's own fresh `PermissionsProvider` mount already sees the new
    // permission.
    await interact(() => vi.advanceTimersByTime(1000));

    expect(container.textContent).toContain("the queue - can configure: true");
    expect(tenanciesApi.fetchMyTenancies).toHaveBeenCalledTimes(1);
    expect(operatorsApi.fetchMyPermissions).toHaveBeenCalledTimes(1);
  });

  it("does not redeem twice when the form is submitted again mid-flight", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockReturnValue(new Promise(() => undefined));
    const container = await render(app());

    await fillCode(container, "kims-shop-invite-code");
    await submit(container);
    await submit(container);

    expect(operatorInvitesApi.redeemOperatorInvite).toHaveBeenCalledTimes(1);
  });
});

describe("what the form checks itself", () => {
  it("does not send an empty code to the server", async () => {
    const container = await render(app());

    await fillCode(container, "   ");
    await submit(container);

    expect(operatorInvitesApi.redeemOperatorInvite).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Enter the invite code you were given.");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });
});

/**
 * One test per outcome, each asserting its own sentence is present and the others are not - a single
 * "shows an error" assertion would pass just as well against a screen that collapsed every failure
 * into one generic message, which is exactly the defect the backlog item warns against.
 */
describe("the four outcomes the backlog names, plus the two the handler actually has", () => {
  it("says the code is wrong, distinctly from every other outcome", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.NotFound", "No operator invite matches this code.", 404),
    );
    const container = await render(app());

    await fillCode(container, "not-a-real-code");
    await submit(container);

    expect(container.textContent).toContain(
      "We couldn't find an invite with that code. Check that you typed it exactly as it was given to you.",
    );
    expect(container.textContent).not.toContain("has expired");
    expect(container.textContent).not.toContain("already been used");
  });

  it("says the code has already been used, distinctly", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.AlreadyRedeemed", "This operator invite has already been redeemed.", 409),
    );
    const container = await render(app());

    await fillCode(container, "used-code");
    await submit(container);

    expect(container.textContent).toContain("This invite code has already been used.");
    expect(container.textContent).not.toContain("has expired");
    expect(container.textContent).not.toContain("We couldn't find an invite");
  });

  it("says the code has expired, distinctly", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.Expired", "This operator invite has expired.", 410),
    );
    const container = await render(app());

    await fillCode(container, "expired-code");
    await submit(container);

    expect(container.textContent).toContain(
      "This invite has expired. Ask whoever invited you to send a new one.",
    );
    expect(container.textContent).not.toContain("already been used");
  });

  it("says this identity already administers the site, distinctly from an already-used code", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.AlreadyOperatorOnSite", "This identity already administers this site.", 409),
    );
    const container = await render(app());

    await fillCode(container, "own-site-code");
    await submit(container);

    expect(container.textContent).toContain("You already have access to this site - there is nothing to redeem.");
    expect(container.textContent).not.toContain("already been used");
  });

  it("says the site has reached its seat limit, distinctly from an already-used code", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.SeatLimitReached", "This site has reached its seat limit of 3.", 402),
    );
    const container = await render(app());

    await fillCode(container, "seat-limited-code");
    await submit(container);

    expect(container.textContent).toContain("This site has reached its plan's operator limit.");
    expect(container.textContent).not.toContain("already been used");
  });

  it("says something usable when the failure is not the server's own problem+json", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(new TypeError("Failed to fetch"));
    const container = await render(app());

    await fillCode(container, "any-code");
    await submit(container);

    expect(container.textContent).toContain("We couldn't redeem that invite. Please try again.");
  });

  it("stays on the form after a refusal, with the code still there to correct", async () => {
    operatorInvitesApi.redeemOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.Expired", "This operator invite has expired.", 410),
    );
    const container = await render(app());

    await fillCode(container, "expired-code");
    await submit(container);

    expect(container.querySelector("form")).not.toBeNull();
    expect(one<HTMLInputElement>(container, "input").value).toBe("expired-code");
  });
});

describe("reaching this screen without an invite", () => {
  it("offers the way to set up a site instead, rather than a dead end", async () => {
    const container = await render(app());

    const link = byText<HTMLAnchorElement>(container, "a", "Setting up your own site instead?");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/onboarding");
  });
});
