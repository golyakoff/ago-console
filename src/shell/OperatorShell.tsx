import { Outlet, useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useOwnerEligibility } from "../auth/useOwnerEligibility.js";
import { getStrings, parseConsoleLocale } from "../i18n/resolve.js";
import { StringsProvider } from "../i18n/StringsContext.js";
import { AppShell, ShellIdentity, type AppShellNavSection } from "./AppShell.js";
import { buildTenantNavSections } from "./consoleNav.js";
import { TenancySwitcher } from "./TenancySwitcher.js";

/**
 * `11-05`. The layout route's element - the context-reading half of the shell, mounted inside
 * `RequireAuth` / `PermissionsProvider` / `OperatorConnectionProvider` (`App.tsx`), which is what
 * makes `usePermissions()` legal here and illegal in `AppShell` itself.
 *
 * Navigation is gated through the *existing* `usePermissions()` hook rather than a new mechanism,
 * exactly as `11-05` asked. This is the same client-side hide `QueuePage` already did with its
 * `hasPermission("site:configure") && <Link>` pair, moved into the shell and given an active state -
 * so it carries the same caveat, and it is worth restating rather than losing in the move: hiding a
 * link is UI, never the gate. Every gated page still checks the permission itself on mount, and
 * `IPermissionChecker` server-side is what actually refuses an operator who types the URL directly.
 *
 * While `permissions` is still `null` (the first `GET /api/v1/operators/me` in flight) the gated
 * sections are simply absent or thinner - the same "not yet known is not the same as denied" rule
 * `PermissionsContext` documents, now expressed through `consoleNav.ts`'s own `permissionsKnown`
 * parameter rather than through this component omitting a block itself.
 *
 * `23-31`: **the five-route `useMatch` tagline list is gone, along with the tagline itself.** The
 * header used to read "Operator console" or "Client console" depending on which of five hand-
 * maintained routes was active - a list `docs/design/design-system/shell.html` already recorded as
 * "already incomplete" (eight of the thirteen tenant screens were never in it). The backlog item's
 * own instruction is direct: the header now says "Офис" and nothing else, on every route, for every
 * identity - `AppShell`'s own brand block renders that literal, un-translated word (the same
 * treatment "AGO" already had), so there is nothing left for this component to compute per route.
 */
export function OperatorShell() {
  const { user, logout } = useAuth();
  const { siteId, locale, hasPermission, permissions, enabledModules, credentialsArePublished, tenancies, activeSiteId, switchTenancy } =
    usePermissions();
  const ownerEligibility = useOwnerEligibility();
  // `11-11`: the one place a specific tenant's locale is ever known - resolved from the active
  // site's own `Locale` (`usePermissions()`'s `locale`, the same "not yet known" `null` state
  // `siteId` already has, which `parseConsoleLocale` treats identically to an unrecognised value:
  // the console's own English default until the real answer arrives).
  const strings = getStrings(parseConsoleLocale(locale));

  // `11-06`: the two workspace routes wanted the full-width, viewport-height frame first, and every
  // other route `OperatorShell` renders is wide unconditionally too (found live, 2026-08-27: a table
  // or a form is not meaningfully narrower than prose, and the reading-width cap only ever made sense
  // for something that reads like a document, which no route left inside this shell actually is).
  const wide = true;
  // Found live, `2026-08-29`: the line above used to also decide `fixed` (viewport height,
  // `overflow: hidden` `<main>`), and every route that asked for the full width inherited that too -
  // a settings form or a site table with no internal scroll region of its own, silently clipped past
  // the fold with no scrollbar. `fixed` is its own question now, and the answer is still "only the
  // three-region workspace" - the one layout actually built with the internal `overflow-y: auto`
  // regions that mode assumes (`AppShell.tsx`'s `fixed` doc comment has the full account).
  const queueMatch = useMatch("/");
  const conversationMatch = useMatch("/conversations/:conversationId");
  // `23-31`: found live while moving `/admin` to `/conversations/all` - `useMatch` matches a
  // *pathname shape*, not "whichever `<Route>` actually rendered", so `/conversations/all` and
  // `/conversations/search` (real, literal sibling routes registered in `App.tsx`, ranked above the
  // dynamic one by React Router's own static-beats-dynamic rule) satisfy
  // `/conversations/:conversationId` too, with `conversationId` bound to the literal word "all" or
  // "search". Left unguarded, this would have made `AdminConversationsPage`/
  // `SearchConversationsPage` - ordinary page-scrolling tables, not the workspace - render inside the
  // viewport-bounded, `overflow: hidden` frame `fixed` is for, the identical clipped-content bug
  // `4b6bec3`'s own doc comment records for the `wide`/`fixed` split before this. Excluded by name
  // rather than by a "looks like a real id" shape check (a UUID regex): the two literal siblings are
  // a closed, known set - `App.tsx`'s own route list - not a pattern to guess at.
  const isRealConversation =
    conversationMatch !== null && conversationMatch.params.conversationId !== "all" && conversationMatch.params.conversationId !== "search";
  const fixed = queueMatch !== null || isRealConversation;

  // `23-24`: unlike `OwnerSitesPage`/`OwnerSiteDetailPage`, this call happens unconditionally on
  // every render of this shell, before the first `GET /api/v1/operators/me` may have returned - so
  // `permissions !== null` is passed explicitly (`buildTenantNavSections`'s own `permissionsKnown`
  // doc comment has the "why" - `hasPermission` alone cannot tell "denied" from "not yet known"
  // apart).
  const sections: AppShellNavSection[] = buildTenantNavSections(
    hasPermission,
    strings,
    enabledModules ?? [],
    permissions !== null,
  );

  // `12-03`: the platform owner's own route, for the one identity on the deployment that holds it.
  // Note what this is *not* gated on - `usePermissions()` carries site-scoped permissions and knows
  // nothing about the platform owner, and the console deliberately does not read the token's
  // `realm_access.roles` to find out either. `useOwnerEligibility()` is `12-01`'s server-side policy
  // decision read back from `12-02`'s endpoint; drawing this link is the only thing it does, and the
  // screen behind it re-asks the server before rendering a row. Labelled "Platform sites" rather
  // than anything containing "admin", which in this product means a tenant's own supervisor.
  // `23-31`: rendered as `AppShell`'s own `pinnedItem` now - one flat entry outside every accordion
  // section, exactly the place it held as the flat list's own final entry before this item.
  const pinnedItem = ownerEligibility === "eligible" ? { to: "/owner", label: strings.navPlatformSites } : undefined;

  return (
    <StringsProvider value={strings}>
      <AppShell
        sections={sections}
        pinnedItem={pinnedItem}
        wide={wide}
        fixed={fixed}
        // `12-04`: the `8-06` demo strip's claim that "its login is published on the demo pages" is
        // false of the platform owner's account, and this shell is where the owner-who-is-also-an-
        // operator spends their whole session. Taken from the eligibility answer already fetched above
        // for the navigation link, so this costs no extra request and cannot disagree with the link.
        // `23-45`: straight from the API, not inferred from who is not the platform owner - see
        // `PublicDemoNotice`'s own remarks. `null` (not yet answered) is `false` here: unknown must not
        // draw the band, or a real tenant would see it flash on every load before it vanished.
        credentialsArePublished={credentialsArePublished === true}
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
