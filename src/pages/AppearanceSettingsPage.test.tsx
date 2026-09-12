import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage.js";
import { THEME_STORAGE_KEY } from "../design/theme.js";
import { interact, one, render, unmount } from "../testing/dom.js";

// `PageHead` comes from `../shell/AppShell.js`, which reads `config.js` at module import time
// (`config.required()` throws outside a real `.env.local`/CI build) - the same mock every other page
// test that renders `PageHead` already needs (`TeamChatPage.test.tsx`'s own precedent).
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const SELECT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");

async function setSelect(select: HTMLSelectElement, value: string) {
  await interact(() => {
    SELECT_VALUE_DESCRIPTOR?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * `25-48`: the page itself is new, but the picker it renders (`ThemeToggle`) and the persistence
 * underneath it (`useTheme()`/`theme.ts`) are not - `25-48`'s own Verified note found both already
 * complete and correct, moved here rather than rebuilt. What is worth proving at this call site,
 * specifically, is that the move did not disturb any of it: the page offers System/Light/Dark, and
 * a choice made here still survives being re-mounted the way a real page reload re-mounts the whole
 * tree - `theme.test.ts` already proves `readStoredTheme`/`localStorage` in isolation; this is the
 * same guarantee read back through the actual page component operators will use.
 */
describe("AppearanceSettingsPage", () => {
  afterEach(async () => {
    await unmount();
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders the System/Light/Dark picker under the page's own title", async () => {
    const container = await render(<AppearanceSettingsPage />);

    expect(container.textContent).toContain("Appearance");

    const select = one<HTMLSelectElement>(container, '[aria-label="Colour theme"]');
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(["system", "light", "dark"]);
    // Nothing stored yet - `useTheme()`'s own default is "system".
    expect(select.value).toBe("system");
  });

  it("a choice made here persists across a reload", async () => {
    const container = await render(<AppearanceSettingsPage />);
    const select = one<HTMLSelectElement>(container, '[aria-label="Colour theme"]');

    await setSelect(select, "dark");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Simulate a reload: tear down the whole tree and mount it again, fresh - the same thing a real
    // page reload does to every React state `useTheme()` might otherwise have kept in memory.
    await unmount();
    const reloaded = await render(<AppearanceSettingsPage />);
    const reloadedSelect = one<HTMLSelectElement>(reloaded, '[aria-label="Colour theme"]');

    expect(reloadedSelect.value).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
