import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellIdentity } from "./AppShell.js";
import { render, unmount } from "../testing/dom.js";

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

/**
 * `25-48`: the theme picker moved out of `ShellIdentity` onto its own `/appearance` page
 * (`AppearanceSettingsPage`) - this is the "no duplicate rendering" half of that move. Before this
 * item, `ShellIdentity` rendered `ThemeToggle` (a `<select>` labelled `themeToggleAriaLabel`,
 * "Colour theme" in the built-in English default `StringsContext` falls back to) right next to
 * sign-out; asserting its absence here is what proves the header is not still drawing it alongside
 * the new page, which would put the control in two places at once - exactly what this item's own
 * Scope forbids.
 *
 * `tenancySwitcher` is omitted on purpose: it renders its own `<select>`
 * (`TenancySwitcher.tsx`), so leaving it out is what makes "there is no `<select>` at all left in
 * this component" an unambiguous assertion about `ThemeToggle` specifically, not a coincidence of
 * two unrelated selects cancelling out.
 */
describe("ShellIdentity", () => {
  afterEach(async () => {
    await unmount();
  });

  it("no longer renders the theme picker", async () => {
    const container = await render(<ShellIdentity operator="Kim" siteId={null} onSignOut={() => {}} />);

    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('[aria-label="Colour theme"]')).toBeNull();
    expect(container.textContent).not.toContain("Match system");
  });

  it("still renders the operator's name and a sign-out control", async () => {
    const container = await render(<ShellIdentity operator="Kim" siteId={null} onSignOut={() => {}} />);

    expect(container.textContent).toContain("Kim");
    expect(container.querySelector("button")).not.toBeNull();
  });
});
