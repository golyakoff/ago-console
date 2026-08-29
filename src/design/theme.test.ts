import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, readStoredTheme } from "./theme.js";

/**
 * `readStoredTheme` is the read half of what makes the toggle survive a reload -
 * `index.html`'s inline script and `useTheme`'s initial state both call it. `writeStoredTheme` and
 * `applyThemeAttribute` stay unexported (`useTheme`'s own module): unlike `alerts.ts`, which takes an
 * injected `Storage` so its round trip is directly testable, this file follows `activeSiteStorage.ts`'s
 * shape - reads the real global `localStorage` under its own try/catch - and this codebase has no DOM
 * testing library installed to render `useTheme` itself (`adr/0030`'s own stated gap). What is
 * testable without one - real `localStorage`, which jsdom provides - is tested here for real, not
 * mocked; the hook-level wiring on top of it was checked live instead (this item's own report).
 */
describe("readStoredTheme", () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it("returns null when nothing has been stored - the 'system' default", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("round-trips a real value written to the exact key index.html's inline script reads", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readStoredTheme()).toBe("light");
  });

  it("treats anything other than exactly 'light'/'dark' as no stored choice, not a crash", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    expect(readStoredTheme()).toBeNull();

    localStorage.setItem(THEME_STORAGE_KEY, "");
    expect(readStoredTheme()).toBeNull();

    localStorage.setItem(THEME_STORAGE_KEY, "DARK");
    expect(readStoredTheme()).toBeNull();
  });
});
