import { Select } from "../components/Select.js";
import { useStrings } from "../i18n/StringsContext.js";
import { type ThemeChoice, useTheme } from "./theme.js";

/**
 * Dark-theme reversal of `adr/0030` point 4. Rendered by `ShellIdentity` next to sign-out - the
 * same header slot `TenancySwitcher` already occupies, and for the same reason: a control an
 * operator might reach for once a shift and then not think about again belongs beside the other
 * per-session identity controls, not inside a settings screen `OperatorShell`'s nav does not have
 * anyway (`site:configure`-gated settings are tenant configuration, not personal preference).
 *
 * The shared `Select`, exactly as `TenancySwitcher` reasons for itself: three fixed options are
 * comfortably inside what a native `<select>` handles well, and reusing it is both less code and
 * more consistent than a bespoke segmented control - adding one would be a twelfth entry on
 * `adr/0030`'s deliberately closed component list for a choice this codebase already has a
 * component for.
 *
 * Renders unconditionally - unlike `TenancySwitcher` there is no "nothing to offer" case: every
 * operator has a system preference and can override it, so there is always a real three-way choice.
 */
export function ThemeToggle() {
  const strings = useStrings();
  const { choice, setChoice } = useTheme();

  return (
    <label className="ago-shell__theme-toggle">
      <span className="ago-shell__theme-toggle-label">{strings.themeToggleLabel}</span>
      <Select
        aria-label={strings.themeToggleAriaLabel}
        value={choice}
        onChange={(event) => setChoice(event.target.value as ThemeChoice)}
      >
        <option value="system">{strings.themeOptionSystem}</option>
        <option value="light">{strings.themeOptionLight}</option>
        <option value="dark">{strings.themeOptionDark}</option>
      </Select>
    </label>
  );
}
