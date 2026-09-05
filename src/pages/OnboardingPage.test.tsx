import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { RegisterSiteError } from "../api/sitesApi.js";
import { OnboardingPage } from "./OnboardingPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `10-03`: the one-time detour a self-registered identity takes before joining the same queue every
 * login reaches. What is worth testing here is not the form's markup but where the authority sits.
 *
 * **Client-side validation is UX, never the gate.** `10-02`'s `RegisterSiteHandler` is the real
 * check, and this page's own `validate()` exists only to catch an obvious typo without a round
 * trip. Two things follow, and both are asserted below: a check that fires must stop the request
 * (otherwise it is decoration), and a value the client accepts but the server rejects must surface
 * the *server's* wording rather than being re-explained by the console - which is what keeps the
 * two from drifting into a client that quietly enforces a stricter rule than the product has.
 *
 * **`Site.AlreadyRegistered` is a destination, not an error.** `10-02` answers a second
 * registration from the same identity with a `409`, which on this screen means "you already have a
 * site" - the same fact `resolveOperatorState` reads at the callback. Rendering it as a failure
 * leaves the caller on a form whose only exit is signing out.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const sitesApi = vi.hoisted(() => ({ registerSite: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn(), fetchOwnerSites: vi.fn() }));

vi.mock("../api/ownerApi.js", () => ownerApi);

vi.mock("../api/sitesApi.js", async () => {
  // `RegisterSiteError` is a real class the page does `instanceof` against, so the module keeps its
  // own definition of it and only the network call is replaced - the same shape
  // `permissionGating.test.tsx` uses for `widgetConfigApi`.
  const actual = await vi.importActual<typeof import("../api/sitesApi.js")>("../api/sitesApi.js");
  return { ...actual, ...sitesApi };
});

function signedIn(): User {
  return { access_token: "keycloak-token", profile: { sub: "keycloak-sub", preferred_username: "new-owner" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function app() {
  return (
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Signed>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/" element={<p>the queue</p>} />
          <Route path="/owner" element={<p>platform sites</p>} />
          <Route path="/redeem-invite" element={<p>redeem an invite</p>} />
        </Routes>
      </Signed>
    </MemoryRouter>
  );
}

function fill(container: HTMLElement, siteName: string, origin: string): Promise<void> {
  return interact(() => {
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    // React swallows a direct `.value` assignment as "no change"; the prototype's own setter is
    // what makes the synthetic input event real (`ConversationPage.test.tsx` has the long version).
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const setValue = (element: HTMLInputElement, value: string): void => {
      descriptor?.set?.call(element, value);
    };

    setValue(inputs[0], siteName);
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    setValue(inputs[1], origin);
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(container: HTMLElement): Promise<void> {
  return interact(() => one<HTMLFormElement>(container, "form").requestSubmit());
}

beforeEach(() => {
  vi.clearAllMocks();
  // `12-04`: the answer for everybody this page is actually for. The owner case sets its own.
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  sitesApi.registerSite.mockResolvedValue({
    siteId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    operatorId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  });
});

afterEach(async () => {
  await unmount();
});

describe("finishing setup", () => {
  it("registers the site with the held token and lands in the queue", async () => {
    const container = await render(app());

    await fill(container, "  Kim's shop  ", "https://shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledWith("keycloak-token", {
      siteName: "Kim's shop",
      initialAllowedOrigin: "https://shop.example.com",
    });
    expect(container.textContent).toContain("the queue");
  });

  it("does not register twice when the form is submitted again mid-flight", async () => {
    // A single-input form still submits on Enter, so the disabled button is not the rule.
    sitesApi.registerSite.mockReturnValue(new Promise(() => undefined));
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledTimes(1);
  });

  it("takes an identity that already has a site to the queue rather than to an error", async () => {
    sitesApi.registerSite.mockRejectedValue(
      new RegisterSiteError("Site.AlreadyRegistered", "This identity has already registered a site."),
    );
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);

    expect(container.textContent).toContain("the queue");
  });
});

/**
 * `23-27`: this identity's other option - somebody handed a code by a site that already exists,
 * rather than setting up a new one. The link is the entire fix this item makes to this file
 * (`RedeemInvitePage.tsx`'s own doc comment has the reasoning for why the routing itself, `CallbackPage`'s
 * unconditional "/onboarding" for state (b), is not widened instead).
 */
describe("the invite-code alternative", () => {
  it("offers a way to redeem an invite instead of registering a new site", async () => {
    const container = await render(app());

    const link = byText<HTMLAnchorElement>(container, "a", "Redeem it here");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/redeem-invite");
  });
});

describe("what the form checks itself", () => {
  it("does not send an empty site name to the server", async () => {
    const container = await render(app());

    await fill(container, "   ", "https://shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Site display name cannot be empty.");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });

  it("does not send something that is not a URL as the embed origin", async () => {
    const container = await render(app());

    await fill(container, "Kim's shop", "shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Embed origin must look like a URL");
  });

  it("does not send a scheme the widget could never be embedded over", async () => {
    const container = await render(app());

    await fill(container, "Kim's shop", "ftp://shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).not.toHaveBeenCalled();
    expect(container.textContent).toContain("must start with http:// or https://");
  });

  it("stays on the form after a refusal, with what was typed still there", async () => {
    const container = await render(app());

    await fill(container, "Kim's shop", "not a url");
    await submit(container);

    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(one<HTMLInputElement>(container, "input").value).toBe("Kim's shop");
  });
});

describe("what the server decides", () => {
  it("sends an origin the client is happy with and the server is not, and shows the server's answer", async () => {
    // `https://shop.example.com/embed` passes `new URL()` and fails `10-02`'s `OriginValidator`
    // (`scheme://host[:port]`, no path). That gap is deliberate - the client checks for an obvious
    // typo and the server decides - and this is the test that would fail if someone "fixed" it by
    // moving the real rule into the browser.
    sitesApi.registerSite.mockRejectedValue(
      new RegisterSiteError("Site.InvalidOrigin", "Origin must not contain a path, query or fragment."),
    );
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com/embed");
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledWith("keycloak-token", {
      siteName: "Kim's shop",
      initialAllowedOrigin: "https://shop.example.com/embed",
    });
    expect(container.textContent).toContain("Origin must not contain a path, query or fragment.");
    expect(container.textContent).not.toContain("the queue");
  });

  it("shows a rate-limit refusal in the server's own words", async () => {
    // `10-02` rate-limits this endpoint per-`sub` and per-IP (`3-05`'s bucket). The console knows
    // nothing about the policy and repeats what it is told - which is what lets the server change
    // the numbers without a console release.
    sitesApi.registerSite.mockRejectedValue(
      new RegisterSiteError("Site.RateLimited", "Too many registration attempts - retry after 30.0s."),
    );
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);

    expect(container.textContent).toContain("Too many registration attempts - retry after 30.0s.");
  });

  it("says something usable when the failure is not the server's own problem+json", async () => {
    sitesApi.registerSite.mockRejectedValue(new TypeError("Failed to fetch"));
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);

    expect(container.textContent).toContain("Failed to set up your site. Please try again.");
    expect(container.textContent).not.toContain("the queue");
  });

  it("is unaffected by the owner probe answering no, which is the ordinary case", async () => {
    // The pre-`12-04` behaviour, pinned: the probe is a new request this page makes on mount, and a
    // "no" from it must leave the registration path exactly as it was.
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("the queue");
  });

  it("lets the visitor try again after a refusal", async () => {
    sitesApi.registerSite.mockRejectedValueOnce(
      new RegisterSiteError("Site.InvalidName", "Site name must be at most 100 characters."),
    );
    const container = await render(app());

    await fill(container, "Kim's shop", "https://shop.example.com");
    await submit(container);
    expect(container.textContent).toContain("Site name must be at most 100 characters.");

    await fill(container, "Shop", "https://shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("the queue");
  });
});

/**
 * `12-04`: the page the platform owner reaches by bookmark, back button or second tab - because
 * `CallbackPage` no longer sends them here, but nothing stops them arriving. It withheld the form and
 * said the server would refuse the submission anyway.
 *
 * `12-05`: **the server does not refuse it any more** (`adr/0063`, "Reversed in 12-05"), so the form
 * is offered - the owner is allowed to run a tenant of their own. What is asserted here is therefore
 * the reverse of `12-04`'s assertion, plus the thing that did *not* change: the explanation is still
 * shown, because arriving here by a stale bookmark is still the likelier reason to be here and the
 * consequence of pressing the button is still permanent.
 *
 * None of this is a gate in either direction. `ago-chat` decides who may register
 * (`PlatformOwnerAsTenantTests` is where that is proven, with real tokens against the real endpoint);
 * this file mocks the network away entirely and could not prove it if it wanted to.
 */
describe("what the platform owner sees here", () => {
  beforeEach(() => {
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");
  });

  it("offers the form, because this identity may now register a site of its own", async () => {
    const container = await render(app());

    expect(container.querySelector("form")).not.toBeNull();
    expect(byText(container, "button", "Finish setup")).not.toBeNull();
  });

  it("still says which account this is, and what registering will do to it", async () => {
    const container = await render(app());

    expect(container.textContent).toContain("You are signed in as the platform owner");
    // The sentence `12-04` could not have written, and the one that carries the whole reversal:
    // registering is now something this identity *may* do, described by its consequence rather than
    // by a refusal. Asserted in full for that reason - a shorter fragment would also match the text
    // this replaced, which said the product could not take the operator row back either.
    expect(container.textContent).toContain(
      "Registering below additionally makes this account an operator of a new site of its own",
    );
  });

  it("registers the site for the owner exactly as it does for anybody else", async () => {
    // The behavioural half: not merely that the button is drawn, but that pressing it takes the same
    // path with the same token and lands in the same place.
    const container = await render(app());

    await fill(container, "Owner's own shop", "https://owner-shop.example.com");
    await submit(container);

    expect(sitesApi.registerSite).toHaveBeenCalledWith("keycloak-token", {
      siteName: "Owner's own shop",
      initialAllowedOrigin: "https://owner-shop.example.com",
    });
    expect(container.textContent).toContain("the queue");
  });

  it("offers the view this identity actually has, rather than only the form", async () => {
    const container = await render(app());

    const onward = byText<HTMLAnchorElement>(container, "a", "Go to the platform operations view");
    expect(onward).not.toBeNull();
    expect(onward?.getAttribute("href")).toBe("/owner");
  });

  it("shows the form until the server has answered, rather than blocking on the probe", async () => {
    // Deliberate, and the opposite trade to `CallbackPage`'s spinner. This page's common reader is a
    // real self-registering shop; gating its form on a probe that exists for one person on the whole
    // deployment would strand that reader on a spinner every time `GET /api/v1/owner/sites` is slow
    // or down. Since `12-05` the cost of an unanswered probe is smaller still: a missing paragraph,
    // not a hidden form.
    ownerApi.probeOwnerEligibility.mockReturnValue(new Promise(() => undefined));

    const container = await render(app());

    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).not.toContain("You are signed in as the platform owner");
  });
});
