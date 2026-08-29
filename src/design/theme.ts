import { useCallback, useState } from "react";

/**
 * The manual override half of the three-state theme switch (system / light / dark) - `tokens.css`'s
 * own header comment has the full picture. `"system"` is never written to storage or to the DOM: it
 * is the *absence* of an override, which is what lets `@media (prefers-color-scheme: dark)` keep
 * doing its job. Only `"light"`/`"dark"` are real, persisted choices.
 *
 * A plain string union, not a boolean - the third state is the point. `adr/0030`'s reversal was
 * asked to default to the OS preference *with* a manual override an operator can reach for during a
 * shift that outlasts their OS's own light/dark schedule, and "on/off" cannot express "no opinion,
 * follow the OS" as a distinct, selectable choice from either.
 */
export type ThemeChoice = "system" | "light" | "dark";

/** Only the two real, persisted values - see `ThemeChoice`'s own comment for why `"system"` never
 * appears here. Namespaced the same way `activeSiteStorage.ts`'s key already is. */
type StoredThemeChoice = "light" | "dark";

/** `index.html`'s inline script reads this exact key, synchronously, before React or `tokens.css`
 * run - keep the two in sync by hand if this ever changes. */
export const THEME_STORAGE_KEY = "ago-console:theme";

function isStoredThemeChoice(value: string | null): value is StoredThemeChoice {
  return value === "light" || value === "dark";
}

/** The same fail-soft shape `activeSiteStorage.ts` already uses: private browsing or storage being
 * disabled degrades to "no stored choice" (the app falls back to `prefers-color-scheme`), never a
 * crash. */
export function readStoredTheme(): StoredThemeChoice | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isStoredThemeChoice(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(choice: StoredThemeChoice | null): void {
  try {
    if (choice === null) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
    // Same fail-soft as the read above - losing the persisted choice costs nothing worse than the
    // toggle defaulting back to "system" on the next load.
  }
}

/** The one place `document.documentElement` is touched for this - `tokens.css`'s dark blocks key
 * off exactly this attribute (`:root[data-theme="dark"]`, and `:not([data-theme="light"])` guarding
 * the `prefers-color-scheme` block so an explicit light choice can override a dark OS setting too). */
function applyThemeAttribute(choice: StoredThemeChoice | null): void {
  if (choice === null) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", choice);
  }
}

/**
 * `ThemeToggle`'s state. Initial value is read from storage once, synchronously, at hook
 * construction - `index.html`'s inline script already applied the matching DOM attribute before
 * this component ever mounted (that is the whole point of that script), so this read is only about
 * getting React's own state to agree with what the DOM already shows, not about applying it again.
 */
export function useTheme(): { choice: ThemeChoice; setChoice: (next: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredTheme() ?? "system");

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    const stored = next === "system" ? null : next;
    writeStoredTheme(stored);
    applyThemeAttribute(stored);
  }, []);

  return { choice, setChoice };
}
