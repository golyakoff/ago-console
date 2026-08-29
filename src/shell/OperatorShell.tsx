import { Outlet, useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useOwnerEligibility } from "../auth/useOwnerEligibility.js";
import { getStrings, parseConsoleLocale } from "../i18n/resolve.js";
import { StringsProvider } from "../i18n/StringsContext.js";
import { AppShell, ShellIdentity, type AppShellNavItem } from "./AppShell.js";
import { buildTenantNavItems } from "./consoleNav.js";
import { TenancySwitcher } from "./TenancySwitcher.js";

/**
 * `11-05`. The layout route's element - the context-reading half of the shell, mounted inside
 * `RequireAuth` / `PermissionsProvider` / `OperatorConnectionProvider` (`App.tsx`), which is what
 * makes `usePermissions()` legal here and illegal in `AppShell` itself.
 *
 * Navigation is gated through the *existing* `usePermissions()` hook rather than a new mechanism,
 * exactly as the item asks. This is the same client-side hide `QueuePage` already did with its
 * `hasPermission("site:configure") && <Link>` pair, moved into the shell and given an active state -
 * so it carries the same caveat, and it is worth restating rather than losing in the move: hiding a
 * link is UI, never the gate. `AdminConversationsPage` and `WidgetConfigPage` each still check the
 * permission themselves on mount, and `11-01`'s and `5-08`'s server-side `IPermissionChecker` checks
 * are what actually refuse an operator who types the URL in directly.
 *
 * While `permissions` is still `null` (the first `GET /api/v1/operators/me` in flight) the gated
 * items are simply absent - the same "not yet known is not the same as denied" rule
 * `PermissionsContext` documents. They appear a moment later; the alternative, rendering them
 * optimistically and removing them, is worse, because a link that vanishes under the pointer is a
 * usability bug and a link that 403s is a lie.
 */
export function OperatorShell() {
  const { user, logout } = useAuth();
  const { siteId, locale, hasPermission, tenancies, activeSiteId, switchTenancy } = usePermissions();
  const ownerEligibility = useOwnerEligibility();
  // `11-11`: the one place a specific tenant's locale is ever known - resolved from the active
  // site's own `Locale` (`usePermissions()`'s `locale`, the same "not yet known" `null` state
  // `siteId` already has, which `parseConsoleLocale` treats identically to an unrecognised value:
  // the console's own English default until the real answer arrives).
  const strings = getStrings(parseConsoleLocale(locale));

  // `11-06`: the two workspace routes wanted the full-width, viewport-height frame first. `/admin`
  // joined next (found live: its content is a five-column table, not prose, and the narrower
  // `--ago-content-max` left a gap lining up with nothing). Found live again, 2026-08-27:
  // `/settings/widget` and `/settings/auto-reply` had the identical problem - a form is not
  // meaningfully narrower than a table, and the reading-width cap only ever made sense for something
  // that reads like a document, which no route left inside this shell actually is any more. Every
  // route `OperatorShell` renders is now wide, unconditionally.
  const wide = true;
  // Found live, `2026-08-29`: the line above used to also decide `fixed` (viewport height,
  // `overflow: hidden` `<main>`), and every one of the routes the paragraph above just made wide
  // inherited that too - a settings form or a site table with no internal scroll region of its own,
  // silently clipped past the fold with no scrollbar. `fixed` is its own question now, and the answer
  // is still "only the three-region workspace" - the one layout actually built with the internal
  // `overflow-y: auto` regions that mode assumes (`AppShell.tsx`'s `fixed` doc comment has the full
  // account). `queueMatch`/`conversationMatch` are back for exactly this, not for `wide` any more.
  // All hooks are called unconditionally and combined afterwards - `||` between `useMatch` calls
  // would short-circuit later ones and change the hook order between renders.
  const queueMatch = useMatch("/");
  const conversationMatch = useMatch("/conversations/:conversationId");
  const fixed = queueMatch !== null || conversationMatch !== null;
  const adminMatch = useMatch("/admin");
  const widgetSettingsMatch = useMatch("/settings/widget");
  const autoReplySettingsMatch = useMatch("/settings/auto-reply");
  // `13-04`: same `site:configure`-gated tenant-management tab as the three above it.
  const billingSettingsMatch = useMatch("/settings/billing");

  // Found live: the header subtitle should name which *tab* is open, not who is signed in - even
  // the platform owner, on their own operator seat, reads "operator console" on the messaging tab
  // and "client console" on any tenant-management one, the identical text an ordinary operator sees
  // there. `/admin`/`/settings/widget`/`/settings/auto-reply`/`/settings/billing` are exactly the
  // `site:configure`-gated tenant-management tabs `consoleNav.ts` groups together; `/`/
  // `/conversations/:id` are the messaging tab and keep `AppShell`'s own default
  // (`operatorConsoleTagline`), so this component only needs to say when to override it.
  const isTenantManagementTab =
    adminMatch !== null || widgetSettingsMatch !== null || autoReplySettingsMatch !== null || billingSettingsMatch !== null;
  const tagline = isTenantManagementTab ? strings.consoleTaglineClient : undefined;

  const nav: AppShellNavItem[] = buildTenantNavItems(hasPermission, strings);

  // `12-03`: the platform owner's own route, for the one identity on the deployment that holds it.
  // Note what this is *not* gated on - `usePermissions()` carries site-scoped permissions and knows
  // nothing about the platform owner, and the console deliberately does not read the token's
  // `realm_access.roles` to find out either. `useOwnerEligibility()` is `12-01`'s server-side policy
  // decision read back from `12-02`'s endpoint; drawing this link is the only thing it does, and the
  // screen behind it re-asks the server before rendering a row. Labelled "Platform sites" rather
  // than anything containing "admin", which in this product means a tenant's own supervisor.
  if (ownerEligibility === "eligible") {
    nav.push({ to: "/owner", label: strings.navPlatformSites });
  }

  return (
    <StringsProvider value={strings}>
      <AppShell
        nav={nav}
        wide={wide}
        fixed={fixed}
        tagline={tagline}
        // `12-04`: the `8-06` demo strip's claim that "its login is published on the demo pages" is
        // false of the platform owner's account, and this shell is where the owner-who-is-also-an-
        // operator spends their whole session. Taken from the eligibility answer already fetched above
        // for the navigation link, so this costs no extra request and cannot disagree with the link.
        demoNoticeAudience={ownerEligibility === "eligible" ? "platform-owner" : "shared-login"}
        identity={
          <ShellIdentity
            operator={operatorDisplayName(user)}
            siteId={siteId}
            // `13-07`/`adr/0068`: only when there is a real choice to offer - a single-tenant
            // operator's shell renders no switcher at all, exactly as it did before this item.
            tenancySwitcher={
              tenancies && tenancies.length > 1 ? (
                <TenancySwitcher tenancies={tenancies} activeSiteId={activeSiteId} onSwitch={switchTenancy} />
              ) : undefined
            }
            onSignOut={() => void logout()}
          />
        }
      >
        <Outlet />
      </AppShell>
    </StringsProvider>
  );
}
