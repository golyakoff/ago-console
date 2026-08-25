import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { RegisterSiteError } from "../api/sitesApi.js";
import { OnboardingPage } from "./OnboardingPage.js";
import { interact, one, render, unmount } from "../testing/dom.js";

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
