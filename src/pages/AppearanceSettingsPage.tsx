import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { ThemeToggle } from "../design/ThemeToggle.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `25-48`: `/appearance` - the standalone home for the theme picker, moved here from the header
 * (`ShellIdentity`, `AppShell.tsx`) rather than duplicated. The picker itself, its persistence and
 * the dark token set are all `25-48` found already shipped and correct (`ThemeToggle.tsx`/
 * `design/theme.ts`); this page contributes only the route and the chrome around the same component.
 *
 * **No permission gate, unconditional - the same shape as `TeamChatPage`/`MyNumbersPage`, not
 * `TagsPage`/`DeviceStorageDisclosurePage`.** Every other settings-style screen in this console
 * checks `site:configure` (or a narrower permission) because it edits *tenant* configuration a
 * colleague could grant or withhold. A colour theme is not that - it is a personal, per-browser
 * preference (`ThemeToggle.tsx`'s own doc comment: "renders unconditionally... every operator has a
 * system preference and can override it"), so this page follows the same "every operator, no check"
 * rule those two ungated pages already establish rather than inventing a gate this screen has no use
 * for.
 *
 * **No route prefix reused from `/settings/*`.** `23-31` retired that prefix entirely, moving every
 * screen that lived under it into one of `consoleNav.ts`'s seven *tenant*-scoped sections
 * (Диалоги/Записи/Аналитика/Команда/Каналы/Автоматизация/Администрирование) - each of those sections
 * is a `site:configure`-or-narrower-gated capability a colleague can grant. Appearance is not tenant
 * configuration and does not fit any of the seven, so reusing `/settings/appearance` (the address
 * this item's own text names as one option) would misfile it right back into the shape `23-31` moved
 * away from. A flat top-level segment, the same shape `/team/chat` and `/onboarding` already use for
 * an ungated, single-purpose screen, is what this route follows instead.
 *
 * **Not yet linked from the nav.** `25-47` (the header's future user-menu) is this page's real link -
 * "Appearance" is one of its own dropdown rows - but that item explicitly depends on this one and
 * this route exists on its own regardless of when `25-47` lands (this item's own Depends-on note).
 * `consoleNav.ts` stays untouched: it is `buildTenantNavSections`'s tenant-scoped sidebar, and nothing
 * about a personal preference belongs in it - there is no other "settings index" in this console this
 * page's own entry would join, so none is added.
 *
 * Nothing else lives here yet - more appearance settings are planned, and this page (not the header)
 * is now where they get a home from the start, matching this item's own scope: "nothing else lives
 * on this page yet".
 */
export function AppearanceSettingsPage() {
  const strings = useStrings();

  return (
    <>
      <PageHead title={strings.appearanceSettingsTitle} description={strings.appearanceSettingsDescription} />

      <Panel>
        <ThemeToggle />
      </Panel>
    </>
  );
}
