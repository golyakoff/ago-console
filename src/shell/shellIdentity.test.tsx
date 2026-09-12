import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellIdentity, type ShellIdentityProps } from "./AppShell.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

// `AppShell.js` reads `config.js` at module import time (`config.required()` throws outside a real
// `.env.local`/CI build) - the same mock `appShellErrorBoundary.test.tsx` already needs for the
// identical reason.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const SITE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SITE_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/**
 * `25-47`: `ShellIdentity` needs a `Router` ancestor now - its Appearance row is a real `Link`, the
 * one thing this component reaches for that `AppShell.tsx`'s own doc comment says needs one
 * (`NavLink`, inside `NavSections`, already established the same requirement before this item).
 */
function identity(props: Partial<ShellIdentityProps> & { operator: string; onSignOut: () => void }) {
  return (
    <MemoryRouter>
      <ShellIdentity {...props} />
    </MemoryRouter>
  );
}

function trigger(container: HTMLElement): HTMLButtonElement {
  return one(container, ".ago-user-menu__trigger");
}

function openMenu(container: HTMLElement): Promise<void> {
  return interact(() => trigger(container).click());
}

function panel(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".ago-user-menu__panel");
}

function itemLabels(container: HTMLElement): string[] {
  return all(container, ".ago-user-menu__item").map((element) => element.textContent?.trim() ?? "");
}

describe("ShellIdentity's closed trigger", () => {
  afterEach(async () => {
    await unmount();
  });

  it("shows the operator's initials, nothing else", async () => {
    const container = await render(identity({ operator: "Андрей Голяков", siteId: null, onSignOut: () => {} }));

    expect(trigger(container).textContent).toBe("АГ");
  });

  it("falls back to the first two characters of a single, bare word", async () => {
    const container = await render(identity({ operator: "golyakoff", siteId: null, onSignOut: () => {} }));

    expect(trigger(container).textContent).toBe("GO");
  });

  it("names the operator in its own accessible label, even though the visible text is just two letters", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    expect(trigger(container).getAttribute("aria-label")).toContain("Kim");
  });

  it("renders no menu content at all until opened", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    expect(panel(container)).toBeNull();
    expect(container.textContent).not.toContain("Sign out");
  });

  it("marks the trigger as a closed disclosure", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("opening and closing the menu", () => {
  afterEach(async () => {
    await unmount();
  });

  it("opens on a click and marks the trigger expanded", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    expect(panel(container)).not.toBeNull();
    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on a second click of the trigger", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);
    await openMenu(container);

    expect(panel(container)).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);
    await interact(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(panel(container)).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it("closes on a pointer-down outside the menu", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);
    await interact(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(panel(container)).toBeNull();
  });

  it("does not close on a pointer-down inside the menu itself", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);
    await interact(() => {
      panel(container)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(panel(container)).not.toBeNull();
  });
});

describe("the menu's header row", () => {
  afterEach(async () => {
    await unmount();
  });

  it("repeats the avatar and shows the operator's full name", async () => {
    const container = await render(identity({ operator: "Андрей Голяков", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    const header = one(container, ".ago-user-menu__header");
    expect(header.querySelector(".ago-avatar")?.textContent).toBe("АГ");
    expect(header.querySelector(".ago-user-menu__header-name")?.textContent).toBe("Андрей Голяков");
  });

  it("names the real tenancy when the caller passed the tenancy list", async () => {
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_A,
        tenancies: [
          { siteId: SITE_A, siteName: "Acme Support" },
          { siteId: SITE_B, siteName: "Widgets Inc" },
        ],
        activeSiteId: SITE_A,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);

    expect(one(container, ".ago-user-menu__header-tenant").textContent).toBe("Acme Support");
  });

  it("falls back to the bare site-id badge text when no tenancy list was ever passed", async () => {
    const container = await render(identity({ operator: "Kim", siteId: SITE_A, onSignOut: () => {} }));

    await openMenu(container);

    expect(one(container, ".ago-user-menu__header-tenant").textContent).toBe(`site ${SITE_A.slice(0, 8)}`);
  });

  it("shows no tenant line at all when there is truly no site yet (onboarding, invite redemption)", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    expect(container.querySelector(".ago-user-menu__header-tenant")).toBeNull();
  });
});

describe("the menu's tenant-switcher section", () => {
  afterEach(async () => {
    await unmount();
  });

  it("does not render for a single-tenant identity", async () => {
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_A,
        tenancies: [{ siteId: SITE_A, siteName: "Acme Support" }],
        activeSiteId: SITE_A,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);

    expect(container.querySelector(".ago-user-menu__section")).toBeNull();
  });

  it("does not render when no tenancy list was passed at all", async () => {
    const container = await render(identity({ operator: "Kim", siteId: SITE_A, onSignOut: () => {} }));

    await openMenu(container);

    expect(container.querySelector(".ago-user-menu__section")).toBeNull();
  });

  it("lists every other tenancy, excluding the active one, in the server's own order", async () => {
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_B,
        tenancies: [
          { siteId: SITE_A, siteName: "Acme Support" },
          { siteId: SITE_B, siteName: "Bee Widgets" },
          { siteId: SITE_C, siteName: "Corner Cafe" },
        ],
        activeSiteId: SITE_B,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);

    const rows = all(one(container, ".ago-user-menu__section"), ".ago-user-menu__item").map(
      (row) => row.textContent?.trim() ?? "",
    );
    expect(rows).toEqual(["Acme Support", "Corner Cafe"]);
  });

  it("falls back to the same disambiguated placeholder as before for an unnamed tenancy", async () => {
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_A,
        tenancies: [
          { siteId: SITE_A, siteName: "Acme Support" },
          { siteId: SITE_B, siteName: "" },
        ],
        activeSiteId: SITE_A,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);

    expect(byText(one(container, ".ago-user-menu__section"), "button", `Unnamed (${SITE_B.slice(0, 8)})`)).not.toBeNull();
  });

  it("calls the real switch mechanism with the chosen tenancy's siteId, and closes the menu", async () => {
    const onSwitchTenancy = vi.fn();
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_A,
        tenancies: [
          { siteId: SITE_A, siteName: "Acme Support" },
          { siteId: SITE_B, siteName: "Widgets Inc" },
        ],
        activeSiteId: SITE_A,
        onSwitchTenancy,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Widgets Inc")?.click());

    expect(onSwitchTenancy).toHaveBeenCalledTimes(1);
    expect(onSwitchTenancy).toHaveBeenCalledWith(SITE_B);
    expect(panel(container)).toBeNull();
  });
});

describe("the menu's fixed rows", () => {
  afterEach(async () => {
    await unmount();
  });

  it("orders header, [tenant switcher,] separator, Appearance, separator, Sign out", async () => {
    const container = await render(
      identity({
        operator: "Kim",
        siteId: SITE_A,
        tenancies: [
          { siteId: SITE_A, siteName: "Acme Support" },
          { siteId: SITE_B, siteName: "Widgets Inc" },
        ],
        activeSiteId: SITE_A,
        onSignOut: () => {},
      }),
    );

    await openMenu(container);

    const children = Array.from(one(container, ".ago-user-menu__panel").children).map((child) => child.className);
    expect(children).toEqual([
      "ago-user-menu__header",
      "ago-user-menu__section",
      "ago-user-menu__separator",
      "ago-user-menu__item", // Appearance
      "ago-user-menu__separator",
      "ago-user-menu__item", // Sign out
    ]);
  });

  it("still separates the header from Appearance/Sign out for a single-tenant identity with no switcher", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    const children = Array.from(one(container, ".ago-user-menu__panel").children).map((child) => child.className);
    expect(children).toEqual([
      "ago-user-menu__header",
      "ago-user-menu__separator",
      "ago-user-menu__item", // Appearance
      "ago-user-menu__separator",
      "ago-user-menu__item", // Sign out
    ]);
  });

  it("links Appearance to 25-48's own page", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    expect(byText<HTMLAnchorElement>(container, "a", "Appearance")?.getAttribute("href")).toBe("/appearance");
  });

  it("closes the menu without navigating away when Appearance is followed - MemoryRouter proves the Link itself works", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);
    await interact(() => byText<HTMLAnchorElement>(container, "a", "Appearance")?.click());

    expect(panel(container)).toBeNull();
  });

  it("calls the real sign-out handler and closes the menu", async () => {
    const onSignOut = vi.fn();
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut }));

    await openMenu(container);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Sign out")?.click());

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(panel(container)).toBeNull();
  });

  it("no longer renders the theme picker - moved to /appearance by 25-48, unchanged by this item", async () => {
    const container = await render(identity({ operator: "Kim", siteId: null, onSignOut: () => {} }));

    await openMenu(container);

    expect(container.querySelector("select")).toBeNull();
    expect(itemLabels(container)).not.toContain("Match system");
  });
});
