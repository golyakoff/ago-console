import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { TenancyDto } from "../api/tenanciesApi.js";
import { operatorInitials } from "../auth/operatorInitials.js";
import { Badge } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { config } from "../config.js";
import { useStrings } from "../i18n/StringsContext.js";
import { AppearanceIcon, SignOutIcon, TenantIcon } from "./menuIcons.js";
import { RenderErrorAlert, RenderErrorBoundary } from "./RenderErrorBoundary.js";

/**
 * `12-04`: who the notice below is talking to. Two values, because the demo console has exactly two
 * kinds of signed-in reader and one sentence that is true of only one of them.
 *
 * `"shared-login"` is the default everywhere, and that direction is the safe one on purpose: it is
 * the stricter notice, so a caller that forgets to pass this - or a new route added later that never
 * learns about it - understates nothing. The value is only ever narrowed by a caller that has the
 * server's own answer in hand.
 */

/**
 * `8-06`. The standing statement that this console is the public demo one, rendered by both shells
 * directly under the header - so it is on the sign-in screen, on the OIDC callback, and on every
 * operator screen afterwards.
 *
 * **Why not only the sign-in screen, which is what the item asks for.** This console has no sign-in
 * screen to put it on: `RequireAuth` redirects to Keycloak from an effect, so the only thing this
 * repository renders "on the way in" is a spinner that is replaced within a few hundred milliseconds
 * by a page Keycloak owns and this repository cannot add a sentence to. A notice that only exists
 * during that flash would satisfy the letter of the item and none of its point. So it renders there
 * *and* stays.
 *
 * **Not dismissible.** The fact it states does not stop being true after it is read, and the
 * operator's mistake it guards against - treating the queue as their own sandbox and answering as if
 * nobody else can see it - is available on every message, not once at sign-in.
 *
 * **It reads `config` rather than taking a prop**, unlike everything else in this file. `config` is a
 * static module constant, not React context, so nothing about the "renders outside every provider"
 * property that lets `AppShell` serve `/signup` and `/callback` changes. The alternative, a prop,
 * would have to be passed correctly by every one of the shells' call sites for the notice to appear,
 * and a disclosure that goes missing when someone adds a route is worse than one this component owns.
 *
 * **`12-04` gave it two wordings; `23-42` removed one of them; `23-45` replaced the whole idea.**
 *
 * `12-04`'s insight was right and is worth keeping: *"its login is published on the demo pages, so
 * anyone can sign in here"* is **false** of the platform owner's account, and a standing disclosure a
 * reader can personally verify as wrong is worth less than no disclosure, because it teaches them the
 * strip is boilerplate. `23-42` then removed the band for that reader entirely, because the audience
 * it was reasoning about turned out to have one member who already knew every fact in it.
 *
 * **What neither could fix is that the console had no way to ask the question.** Both inferred the
 * answer from *who is not the platform owner*, so a **real tenant** signing in with their own account
 * was told their login is published - which the author found by doing exactly that. A minted demo
 * tenant was told the same, equally wrongly: its credentials are shown once, on one screen, and
 * printed on no page.
 *
 * **So `23-45` moved the question to the only place that can answer it.** The API now says whether
 * *this site's console credentials are printed on a public page* (`credentialsArePublished`), from
 * configuration naming the shared demo shops. It cannot be derived: a minted tenant is identifiable by
 * its expiry but its credentials are not published, and the seeded shared shops have no expiry at all,
 * so in the database they are indistinguishable from a real tenant. It is also not a property of the
 * tenant - the same row on another deployment has no password on any web page.
 *
 * **The band is therefore shown to exactly one kind of account**, the one for which every clause in it
 * is true. Everyone else - real tenants, minted demo tenants, the platform owner - sees nothing.
 *
 * **The failure direction is inverted, deliberately and at a cost.** `12-04` was careful that
 * forgetting the prop showed the *stricter* text; this default shows nothing, because "we do not know
 * that your password is published" cannot honestly render as "your password is published". The cost is
 * that an empty configuration would silently un-warn the one account that needs it - so
 * `Ago.Chat.Api`'s `DemoTenantOptionsValidator` refuses to start a demo deployment whose published-site
 * list is empty. The guard moved from a default to a boot failure.
 *
 * **Pre-session screens now show nothing either**, and that is a real loss: `8-06` wanted this on the
 * sign-in screen, and a reader about to use the published login is no longer warned before they use
 * it. Accepted because nothing before sign-in knows whose account is coming, and the band appears the
 * instant that account lands in the console - which is before they can type anything into it.
 */
function PublicDemoNotice({ credentialsArePublished }: { credentialsArePublished: boolean }) {
  const strings = useStrings();
  if (!config.isPublicDemo || !credentialsArePublished) {
    return null;
  }

  return (
    <div className="ago-demo-notice">
      {/* The band is full-bleed; the sentence inside it is capped and centred on the same
          `--ago-shell-max` measure as the header row above, so it starts on the brand's own left
          edge instead of running the whole width of a 1440px monitor. */}
      <span className="ago-demo-notice__text">
        {/* `23-42`: one string, not a ternary. The only audience that reaches this line is the one
            the guard above did not return for, so a second branch here would be unreachable code
            claiming a variant exists. `publicDemoNoticePlatformOwner` is deleted with it. */}
        {strings.publicDemoNoticeSharedLogin}
      </span>
    </div>
  );
}

export interface AppShellNavItem {
  /**
   * Absent only when {@link AppShellNavItem.reserved} is true - a reserved entry has no route to
   * link to yet.
   */
  to?: string;
  label: string;
  /** `NavLink`'s own `end` - `/` would otherwise match every route below it. */
  end?: boolean;
  /**
   * `23-31`/`adr/0129`: **replaces** the muting rule `23-24` recorded (decision §10,
   * `docs/design/decisions.md`) - see `adr/0129` for the full argument and what it gives up. Muted
   * now means *"this identity could obtain the thing behind this entry itself"*, which in this
   * console today is exactly one case: the calendar module, for an identity that holds
   * `site:configure` (can buy an add-on, the same gate `ProductsPage.PRODUCTS_PERMISSION` already
   * uses) but not `calendar:configure` itself. Still a real, keyboard-reachable link to the same
   * route - never `disabled` - drawn fainter (`.ago-shell__rail-link--muted`/
   * `.ago-shell__drawer-link--muted`) and carrying a small {@link Badge} naming the reason
   * (`strings.navBuyableLabel`). `consoleNav.ts` is the only place that sets this.
   */
  muted?: boolean;
  /**
   * `23-31`: a place held in the navigation's own structure for a screen that does not exist yet
   * (`Записи`, `Общение`, the three unbuilt channel screens, `ИИ-подсказки`, `ИИ-автоответ`,
   * `Документы`) - the backlog item's own words are "drawn as unavailable rather than omitted, so
   * the structure does not have to be rebuilt when each arrives". Rendered as inert text, never an
   * `<a>` - no `href`, not part of the tab order, so it can never read as a working link that merely
   * 404s. `consoleNav.ts` is the only place that sets this.
   */
  reserved?: boolean;
}

/**
 * `23-31`: one of the seven left-column accordion sections `consoleNav.ts` builds. Two levels only -
 * a section and its items - because the item's own Goal is that nothing sits more than two clicks
 * from the rail; no section carries a third level (`docs/backlog/23-31-*.md`'s "One naming rule"
 * addendum settles the one place a third level was considered, for the "Каналы" section, and decides
 * against it - see `consoleNav.ts`'s own remarks).
 */
export interface AppShellNavSection {
  id: string;
  label: string;
  items: AppShellNavItem[];
}

/** `to` is `undefined` only for a `reserved` item, which never reaches `NavLink` at all - see
 * {@link NavSections}. */
function isItemActive(item: AppShellNavItem, pathname: string): boolean {
  if (!item.to) {
    return false;
  }
  if (item.end) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * Which section the accordion should open for the current URL - so a direct link or a browser
 * back/forward lands on the right section already expanded, not on whichever one happened to be
 * open before. Two passes: an exact `NavLink`-style match first (respects `end`, the same rule the
 * active-link styling itself uses), then a looser path-prefix match for a drill-down route that has
 * no nav entry of its own (`/calendar/masters/:workerId/slots`, reached only from a table row, not
 * from this rail) but still belongs, visibly, under one section.
 */
function activeSectionId(sections: AppShellNavSection[], pathname: string): string | null {
  for (const section of sections) {
    if (section.items.some((item) => isItemActive(item, pathname))) {
      return section.id;
    }
  }
  for (const section of sections) {
    if (section.items.some((item) => item.to && item.to !== "/" && pathname.startsWith(item.to))) {
      return section.id;
    }
  }
  return null;
}

/**
 * `23-31`: the *only* caller of `useLocation()` in this file, and deliberately its own component
 * rather than a hook called straight from `AppShell` - see `AppShell`'s own remarks on `routeOpenId`
 * for why: it is mounted only inside `{hasNav && ...}`, the identical precondition `NavLink` already
 * has, so it never renders (and never calls `useLocation()`) in the one shape that has no `Router`
 * ancestor to give it (`SignupPage`'s own test, `<AppShell>` with no `sections` and no
 * `MemoryRouter`). Renders nothing - it exists purely to push the route's own section id back up to
 * `AppShell` on every navigation, via the callback prop rather than a return value, because a
 * component that renders `null` has no other way to communicate outward.
 *
 * `useLayoutEffect`, not `useEffect` - so the newly-active section is already open in the very frame
 * a navigation paints, rather than flashing whatever was open a moment before for one frame first.
 */
function RouteSectionSync({
  sections,
  onRouteSectionChange,
}: {
  sections: AppShellNavSection[];
  onRouteSectionChange: (id: string | null) => void;
}) {
  const location = useLocation();
  const routeOpenId = useMemo(() => activeSectionId(sections, location.pathname), [sections, location.pathname]);
  useLayoutEffect(() => {
    onRouteSectionChange(routeOpenId);
  }, [routeOpenId, onRouteSectionChange]);
  return null;
}

/**
 * The two-level accordion itself - one renderer, mounted twice (the desktop rail, the mobile
 * drawer), over the identical `sections` array, the same "same data, two renderers, never a second
 * list" discipline `consoleNav.ts`'s own remarks already state for the muted/ordinary split before
 * this item. `openId`/`onOpenSection` are lifted to `AppShell` so the two renderings can never
 * disagree about which section is open, even though only one of them is ever visually reachable at a
 * given viewport.
 */
function NavSections({
  sections,
  openId,
  onOpenSection,
  variant,
  onNavigate,
}: {
  sections: AppShellNavSection[];
  openId: string | null;
  onOpenSection: (id: string) => void;
  variant: "rail" | "drawer";
  /** Closes the mobile drawer on a real navigation - `Dialog`'s own `onClose` never fires for a
   * `NavLink` click (`AppShell`'s previous drawer already needed this, unchanged). */
  onNavigate?: () => void;
}) {
  const strings = useStrings();
  const sectionClass = variant === "rail" ? "ago-shell__rail-section" : "ago-shell__drawer-section";
  const groupClass = variant === "rail" ? "ago-shell__rail-group" : "ago-shell__drawer-group";
  const itemsClass = variant === "rail" ? "ago-shell__rail-items" : "ago-shell__drawer-items";
  const linkClass = variant === "rail" ? "ago-shell__rail-link" : "ago-shell__drawer-link";

  return (
    <>
      {sections.map((section) => {
        const isOpen = section.id === openId;
        const panelId = `${variant}-${section.id}-items`;

        return (
          <div key={section.id} className={groupClass}>
            <button
              type="button"
              className={sectionClass}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => onOpenSection(section.id)}
            >
              <span className="ago-shell__nav-link-label">{section.label}</span>
              <span className="ago-shell__rail-chevron" aria-hidden="true" />
            </button>
            {isOpen && (
              <div className={itemsClass} id={panelId}>
                {section.items.map((item) =>
                  item.reserved || !item.to ? (
                    <span
                      key={`${section.id}:${item.label}`}
                      className={`${linkClass} ${linkClass}--reserved`}
                      aria-disabled="true"
                    >
                      <span className="ago-shell__nav-link-label">{item.label}</span>
                      <Badge tone="neutral">{strings.navComingSoonLabel}</Badge>
                    </span>
                  ) : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        [linkClass, isActive && `${linkClass}--active`, item.muted && `${linkClass}--muted`]
                          .filter(Boolean)
                          .join(" ")
                      }
                    >
                      <span className="ago-shell__nav-link-label">{item.label}</span>
                      {item.muted && <Badge tone="accent">{strings.navBuyableLabel}</Badge>}
                    </NavLink>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** `23-31`: "Platform sites" - the one nav destination that is not part of the tenant-scoped
 * structure `consoleNav.ts` builds, rendered once, outside every accordion section, the same
 * always-last, own-active-state place it held as the final flat-list entry before this item
 * (`OperatorShell`/`OwnerSitesPage`/`OwnerSiteDetailPage` each still append it themselves). */
function PinnedNavLink({
  item,
  variant,
  onNavigate,
}: {
  item: AppShellNavItem;
  variant: "rail" | "drawer";
  onNavigate?: () => void;
}) {
  const linkClass = variant === "rail" ? "ago-shell__rail-link" : "ago-shell__drawer-link";
  if (!item.to) {
    return null;
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [linkClass, `${linkClass}--pinned`, isActive && `${linkClass}--active`].filter(Boolean).join(" ")
      }
    >
      <span className="ago-shell__nav-link-label">{item.label}</span>
    </NavLink>
  );
}

export interface AppShellProps {
  /** `23-31`: replaces the flat `nav` array - already filtered and shaped into sections by the
   * caller (`consoleNav.ts`'s `buildTenantNavSections`). `OperatorShell` is where the permission
   * gate lives; this component renders whatever it is handed and makes no authorization decision of
   * its own, exactly as the flat array before it did. */
  sections?: AppShellNavSection[];
  /** `23-31`: "Platform sites" - see {@link PinnedNavLink}'s own doc comment for why this is a
   * separate prop rather than one more section. */
  pinnedItem?: AppShellNavItem;
  /** The signed-in operator block, sign-out included. Absent on the pre-session routes
   * (`/signup`, `/callback`), where there is nobody to name. */
  identity?: ReactNode;
  /**
   * `11-06`, narrowed `2026-08-29` (found live: pages were losing all vertical scrolling, see
   * `fixed` below for the bug this split fixes). Controls width only now: the shell's reading-width
   * cap (`--ago-content-max`, right for a line of prose) versus its full cap (`--ago-shell-max`,
   * right for a table or a form that is not meaningfully narrower than one). The default is the
   * reading-width layout every document-shaped screen wants; a 1180px-wide line of 15px text is past
   * the readable measure, which is why the cap exists at all.
   *
   * It is a prop rather than something the shell works out for itself because `AppShell` reads no
   * context and knows no routes, deliberately (see this component's own doc comment) - the caller
   * that already knows which route is rendering is the one that can answer this.
   */
  wide?: boolean;
  /**
   * `2026-08-29`, split out of `wide`. The route below is a *workspace*, not a document or a table:
   * it owns its own internal scroll regions (the conversation rail, the thread, the visitor panel -
   * `workspace.css`) and needs the shell bounded to the viewport (`100dvh`, `overflow: hidden` on
   * `<main>`) so those regions - not the page - are what scrolls.
   *
   * **Found live, `2026-08-29`: this used to be the same flag as `wide`, and that was the bug.**
   * `4b6bec3` made `wide` unconditional across every route `OperatorShell` renders, to fix a real
   * width complaint (a settings form or a site table pinned to the narrow reading-width cap). But
   * `wide` carried `fixed`'s viewport-bounded, `overflow: hidden` behaviour along with it, and every
   * one of those newly-wide routes - `/admin`, `/owner`, `/settings/widget`, `/settings/auto-reply`,
   * `/settings/canned-responses`, `/settings/tags`, `/settings/billing`, `/search`, `/analytics` - is
   * an ordinary page with no internal scroll region of its own. `.ago-table-scroll` (`Table.tsx`)
   * only scrolls *horizontally*. The result: any of those pages taller than the viewport clipped its
   * own overflow silently, with no scrollbar anywhere - reported live, reproduced on `/settings/tags`
   * and `/analytics` first. Only the workspace layout (`WorkspaceLayout`, mounted at `/` and
   * `/conversations/:id`) was ever built with the internal `overflow-y: auto` regions this mode
   * assumes, so it is now the only caller that passes `fixed`. Every other `wide` page keeps normal,
   * page-level scrolling - `wide` alone no longer touches height or overflow at all.
   */
  fixed?: boolean;
  /**
   * `12-04`: who the `8-06` demo strip is addressing, when this build is the public demo one. Passed
   * only by the callers that hold the server's own answer about this identity - `OperatorShell` and
   * `OnboardingPage` (from `useOwnerEligibility`) and `OwnerSitesPage` (from its own accepted
   * request). Everything else omits it and gets the stricter shared-login wording, which is the
   * correct thing to say to a reader nobody has established anything about.
   */
  /** `23-45`: whether this reader's own console credentials are published on a public page, from the
   * API (`credentialsArePublished`). Defaults to `false`, so a shell that does not pass it draws no
   * band - see `PublicDemoNotice`'s own remarks on why that direction was chosen over `12-04`'s. */
  credentialsArePublished?: boolean;
  children: ReactNode;
}

/**
 * `11-05`. The persistent frame every route renders inside: product identity, navigation with an
 * active state, the signed-in operator, and the page underneath.
 *
 * Deliberately presentational and prop-driven for everything that varies by *route* - it reads no
 * context for `sections`/`identity`/`wide`. That is what lets the same header sit on `/signup` and
 * `/callback`, which mount outside `PermissionsProvider` and `OperatorConnectionProvider` entirely
 * (`App.tsx` has the reasoning for why those routes are outside the operator layout), where a shell
 * that called `usePermissions()` would throw. The context-reading half of *that* lives in
 * `OperatorShell`, which is mounted only inside those providers.
 *
 * `23-31`: **the left column replaces the old horizontal strip**, and it is a two-level accordion,
 * not a flat list - the backlog item's own Goal: an operator should see four things they can act on,
 * a tenant should find a setting without reading twenty-four labels. Both the desktop rail
 * (`.ago-shell__rail`, always visible, `.frame`'s left column in the agreed mock) and the mobile
 * drawer render the identical `NavSections` over the identical `sections` array - never two
 * independently-built lists, the same discipline the old drawer/bar split already had.
 *
 * `useLocation()` (via `RouteSectionSync`) decides which section opens for the current route - a
 * deliberate, narrow exception to "reads no context of its own": `NavLink` below already depends on
 * a `Router` ancestor to render at all, so this adds no new dependency, only a new read of one
 * `Router` already requires. A manual override (clicking a *different* section) takes priority until
 * the next navigation changes which section the route itself belongs to, at which point the override
 * is dropped and the route's own section takes back over - see `handleRouteSectionChange` below.
 *
 * `11-11`: this component's own chrome text (the skip link, nav's aria-label, the demo notice) *does*
 * read `useStrings()` now - safe specifically because that context is defaulted, not nullable
 * (`StringsContext.tsx`'s own remarks): a caller with no `<StringsProvider>` above it (every
 * pre-session route) gets the console's built-in English rather than a thrown error, so the "renders
 * outside every provider" property this doc comment describes still holds.
 *
 * The `<header>`/`<nav>`/`<main>` landmarks and the skip link are the point of having a shell at
 * all from an accessibility standpoint: before this, every screen was a bare `<div>` and a
 * keyboard user had no way past the navigation.
 */
export function AppShell({
  sections,
  pinnedItem,
  identity,
  wide = false,
  fixed = false,
  credentialsArePublished = false,
  children,
}: AppShellProps) {
  const strings = useStrings();
  // `11-14`: local to this component, not context - the same call `PublicDemoNotice`'s own doc
  // comment argues against for `sections`/`identity`/`wide` above: whether the drawer is open is a
  // property of one render of the shell, not something any other component needs to read, and
  // `AppShell` already reads no context of its own by design (this component's own doc comment).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  // Narrows `sections` to a real array once, here, rather than at each renderer below -
  // `sections && sections.length > 0 && sections.map(...)` repeated would re-ask the same
  // optional-array question for no benefit TypeScript's own control-flow narrowing gives back (it
  // does not narrow through an intermediate `const`, so this is the version that actually compiles
  // without a non-null assertion).
  // Wrapped in its own `useMemo` (rather than a bare `sections ?? []`) so the `useMemo` below that
  // depends on it has a stable dependency to compare against, not a fresh `[]` literal on every
  // render a caller happens to pass no `sections` at all.
  const navSections = useMemo(() => sections ?? [], [sections]);
  // `23-31`: `pinnedItem` counts too - found while testing `OwnerSitesPage` for an owner with no
  // operator seat at all (`sections` empty, `pinnedItem` "Platform sites" still passed): the rail,
  // drawer and hamburger button are all gated on `hasNav`, and `pinnedItem` renders *inside* each of
  // them (`PinnedNavLink`'s own doc comment), so a `hasNav` that ignored it would hide "Platform
  // sites" itself the moment there was nothing else to show beside it - exactly the identity this
  // page exists for.
  const hasNav = navSections.length > 0 || pinnedItem !== undefined;

  // `23-31`: which section the route itself belongs to - computed by `RouteSectionSync` below, never
  // by calling `useLocation()` directly in this component. `AppShell` renders on `/signup` and
  // `/callback` with `sections` empty (this component's own doc comment on why it reads no context),
  // and those two routes are the reason this is not a plain `useLocation()` call here: `SignupPage`'s
  // own test mounts a bare `<AppShell>` with no `<MemoryRouter>` ancestor at all (nothing in that
  // render needs one - no `sections`, so no `NavLink` either, `NavLink` being the one thing that
  // already required a `Router` before this item). `useLocation()` would throw in exactly that render.
  // `RouteSectionSync` is a real, separate component instance, mounted only inside `{hasNav && ...}`
  // below - so it calls `useLocation()` only in the render that also mounts `NavLink`, which already
  // requires the identical `Router` ancestor, never in the render that has neither.
  const [routeOpenId, setRouteOpenId] = useState<string | null>(null);
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  // A manual click (`setOpenOverride`) wins until the *route's own* section changes - navigating
  // (by any means: a rail click, a drawer click, the browser back button, a redirect) drops the
  // override so the newly-active route's section reclaims the accordion, rather than leaving a stale
  // manually-opened section expanded over content that no longer belongs to it. `useCallback` so
  // `RouteSectionSync`'s own `useLayoutEffect` sees a stable function identity and does not re-fire
  // on every `AppShell` render for no reason.
  const handleRouteSectionChange = useCallback((id: string | null) => {
    setRouteOpenId(id);
    setOpenOverride(null);
  }, []);
  // Always exactly one section open, never zero - the item's own Done-when ("the accordion keeps
  // one section open"). `sections[0]` is the fallback only when the current route matches nothing
  // in any section (the pre-permissions-answer instant, or a route with no nav entry at all).
  const openId = openOverride ?? routeOpenId ?? navSections[0]?.id ?? null;

  return (
    <div className={fixed ? "ago-shell ago-shell--fixed" : "ago-shell"}>
      <a className="ago-skip-link" href="#ago-main">
        {strings.skipToContent}
      </a>
      {/* `ago-shell__sticky` wraps the header and the demo notice together so both stay pinned as one
          unit while the page scrolls - see `shell.css`'s own remarks on why this is a shared wrapper
          rather than a second independently-sticky sibling. */}
      <div className="ago-shell__sticky">
        <header className="ago-shell__header">
          <div className="ago-shell__header-row">
            <span className="ago-shell__brand-row">
              {/* `11-14`: always in the DOM, hidden by `shell.css`'s own media query above the mobile
                  breakpoint - the same "render once, hide by CSS" idiom the rail below already uses,
                  rather than a second, JS-computed "is this mobile" branch. */}
              {hasNav && (
                <button
                  type="button"
                  className="ago-shell__menu-button"
                  aria-label={strings.navOpenMenu}
                  aria-expanded={drawerOpen}
                  aria-controls={drawerId}
                  onClick={() => setDrawerOpen(true)}
                >
                  <span className="ago-shell__menu-icon" aria-hidden="true" />
                </button>
              )}
              {/* `23-31`: the header says "AGO Офис" and nothing else - the old two-line "AGO" wordmark
                  plus a route-driven tagline ("Operator console"/"Client console"/"Platform owner
                  console") is gone, and with it the five-route `useMatch` list `OperatorShell` used
                  to compute which one to show. A brand name, like the glyph beside it - not looked up
                  in `strings`, the same reasoning `ux-gate/lib/i18nCompleteness.ts` already gives for
                  never translating "AGO". `25-49`: the label itself grew from "Офис" to "AGO Офис" -
                  the product's real name, not just its module. */}
              <span className="ago-shell__brand">
                <span className="ago-shell__glyph" aria-hidden="true">
                  A
                </span>
                <span className="ago-shell__wordmark">AGO Офис</span>
              </span>
            </span>

            {identity && <div className="ago-shell__identity">{identity}</div>}
          </div>
        </header>

        <PublicDemoNotice credentialsArePublished={credentialsArePublished} />
      </div>

      {/* `23-31`: renders nothing - see its own doc comment for why this, and not a bare
          `useLocation()` call above, is what keeps `AppShell` safe to mount with no `Router`
          ancestor whenever there is no nav to show at all. */}
      {hasNav && <RouteSectionSync sections={navSections} onRouteSectionChange={handleRouteSectionChange} />}

      {/* `11-14`/`23-31`: the drawer - a second renderer over the exact same `sections` array the
          rail below maps, never a second list (`consoleNav.ts`'s own remarks on why a duplicated,
          independently-gated list is the failure mode this item exists to avoid). `Dialog`'s
          `variant="drawer"` is the native `<dialog>`/`showModal()` element (`adr/0030` point 3),
          which is what gives this keyboard reachability, focus trapping and focus restoration to the
          hamburger for free - the identical guarantee every other `Dialog` consumer in this codebase
          already relies on, not something this component re-implements. */}
      {hasNav && (
        <Dialog
          id={drawerId}
          variant="drawer"
          open={drawerOpen}
          title={strings.navSectionsAriaLabel}
          // `25-50`: the drawer needs an accessible name the instant it opens (`Dialog`'s own
          // `aria-labelledby`), but no visible heading - "Console sections" is not shown anywhere
          // else in this shell, mobile or desktop, and duplicated the hamburger button's own
          // `aria-label` for no reader's benefit. `Dialog`'s `visuallyHiddenTitle` keeps the same
          // string wired to the same `<h2>`/`aria-labelledby` pair, only hidden on screen.
          visuallyHiddenTitle
          onClose={() => setDrawerOpen(false)}
        >
          <nav className="ago-shell__drawer-nav" aria-label={strings.navSectionsAriaLabel}>
            <NavSections
              sections={navSections}
              openId={openId}
              onOpenSection={setOpenOverride}
              variant="drawer"
              // Choosing an item is the third dismissal route the `11-14` Done-when names (backdrop,
              // Escape, choosing an item) - `Dialog`'s native `onClose` covers the first two, but a
              // `NavLink` click never fires it, so this is wired directly.
              onNavigate={() => setDrawerOpen(false)}
            />
            {pinnedItem && (
              <PinnedNavLink item={pinnedItem} variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            )}
          </nav>
        </Dialog>
      )}

      {hasNav ? (
        <div className="ago-shell__body">
          <nav className="ago-shell__rail" aria-label={strings.navSectionsAriaLabel}>
            <NavSections sections={navSections} openId={openId} onOpenSection={setOpenOverride} variant="rail" />
            {pinnedItem && <PinnedNavLink item={pinnedItem} variant="rail" />}
          </nav>
          <main
            className={["ago-shell__main", wide ? "ago-shell__main--wide" : null, fixed ? "ago-shell__main--fixed" : null]
              .filter(Boolean)
              .join(" ")}
            id="ago-main"
          >
            {/* `23-41`: see `RenderErrorBoundary.tsx`'s own doc comment for why this is one of its
                three mount points - every route in the console reaches this `<main>` through here or
                the `!hasNav` branch below, so wrapping it once is what a future screen inherits for
                free rather than something it has to opt into. */}
            <RenderErrorBoundary fallback={(_error, reset) => <RenderErrorAlert onRetry={reset} />}>
              {children}
            </RenderErrorBoundary>
          </main>
        </div>
      ) : (
        <main
          className={["ago-shell__main", wide ? "ago-shell__main--wide" : null, fixed ? "ago-shell__main--fixed" : null]
            .filter(Boolean)
            .join(" ")}
          id="ago-main"
        >
          <RenderErrorBoundary fallback={(_error, reset) => <RenderErrorAlert onRetry={reset} />}>
            {children}
          </RenderErrorBoundary>
        </main>
      )}
    </div>
  );
}

export interface ShellIdentityProps {
  /** `operatorDisplayName(user)` - the identity's real name (Keycloak's `name` claim) when the
   * provider has one, falling back through `preferred_username`/`sub`. */
  operator: string;
  /** The operator's own site, when it is known. `null` on `/onboarding`, where the whole point is
   * that there is not one yet. Used only as a fallback label for the menu's header row (`site
   * 12345678`, unchanged wording from before this item) when {@link ShellIdentityProps.tenancies} is
   * not passed at all - a caller that does pass `tenancies` always has a real site *name* to show
   * instead. */
  siteId?: string | null;
  /**
   * `13-07`/`adr/0068`/`25-47`: every tenancy this operator belongs to - the identical list
   * `PermissionsContext.tenancies` already carries and the deleted `TenancySwitcher`'s own `<select>`
   * used to consume. `undefined`/`null` for every caller of this component except `OperatorShell`
   * (`OwnerPricingPage`, `OwnerSiteDetailPage`, `OwnerSitesPage`, `OnboardingPage`,
   * `RedeemInvitePage`), which know at most a bare {@link ShellIdentityProps.siteId} and have never
   * had a list to switch between. The menu's own tenant-switcher section renders only when this,
   * minus the active tenancy, is non-empty - see `otherTenancies` below - the identical "renders
   * nothing extra for a single-tenant identity" gate the old `<select>` had.
   */
  tenancies?: TenancyDto[] | null;
  /** The tenancy `PermissionsProvider` resolved as active - `PermissionsContext.activeSiteId`,
   * unchanged by this item. Read only to find the current tenancy's own name inside `tenancies` and
   * to exclude it from the switch list. */
  activeSiteId?: string | null;
  /**
   * `13-07`'s own `switchTenancy` (`PermissionsContext`) - reused here, not reinvented. This item
   * changes how the switcher is *presented* (a row per other tenant inside this menu, replacing
   * `TenancySwitcher`'s `<select>`) and never touches how a choice is carried out: persisted, then a
   * full page reload, exactly as `PermissionsProvider`'s own doc comment on `switchTenancy` already
   * argues for. Absent for a caller with no `tenancies` to switch between.
   */
  onSwitchTenancy?: (siteId: string) => void;
  onSignOut: () => void;
}

/**
 * The right-hand end of the header, collapsed behind one avatar (`25-47`). Frame furniture, not one
 * of the eleven - it exists so the six shells that render it (`OperatorShell`, `OwnerPricingPage`,
 * `OwnerSiteDetailPage`, `OwnerSitesPage`, `OnboardingPage`, `RedeemInvitePage` - the last three
 * outside the operator providers entirely) cannot drift.
 *
 * Before `11-05` this was a `<button>` inside a `<p>` at the top of two page bodies. Before `25-47`
 * it was the operator's name, an optional tenancy `<select>` and a visible "Sign out" button, all
 * three sitting in the header row at once - the shape `docs/design/gaps.md` pile 3 item 8 named
 * directly: "Badge is the product's only representation of a person - no avatar, no initial, no
 * name." This item answers that and GitHub's own account menu is its named reference: one circular
 * avatar showing the signed-in operator's initials (`operatorInitials`), everything else - identity,
 * the tenant switch, Appearance, Sign out - behind a dropdown it opens.
 *
 * **Why a hand-rolled disclosure, not `Dialog` and not `<details>`.** `Dialog` is this codebase's own
 * answer to "the platform does the hard part" (`adr/0030` point 3), but its hard part is
 * *modality* - `showModal()`'s inertness, its own top layer, focus trapped inside it - and this menu
 * is deliberately not modal: the header, the nav rail and the page behind it all stay live and
 * clickable while it is open, the same way GitHub's own does. A native `<details>`/`<summary>` gets
 * open/close and keyboard activation for free, but neither outside-click nor Escape close it - which
 * is exactly why GitHub's own markup pairs `<details>` with a second, JS-driven custom element
 * (`<details-menu>`) to add both. Reaching for the identical two behaviours by hand here - one
 * `useState`, one document-level `pointerdown` listener, one `keydown` listener - is not more code
 * than wiring that pairing would be, and it is the one thing in this file with no native
 * counterpart to delegate to either way.
 *
 * **Not a full ARIA `menu`/`menuitem` widget, deliberately.** That role pattern promises roving
 * `tabindex` and arrow-key navigation (the WAI-ARIA Authoring Practices' own menu pattern), which
 * this does not implement - claiming the role without the behaviour is worse than not claiming it.
 * What is here instead is a disclosure (`aria-haspopup`/`aria-expanded`/`aria-controls` on the
 * trigger) revealing a plain list of real, independently focusable controls - buttons and one
 * `Link` - so Tab already reaches every row in the browser's own order with no extra wiring. The
 * same "minimal but real, not the fully-general control" call `TenancySwitcher`'s own doc comment
 * made for reaching for `Select` over a combobox.
 *
 * `25-48`: still does not render `ThemeToggle` - `adr/0030` point 4's theme picker has its own home
 * at `/appearance` now, and this menu's own Appearance row is what links there, replacing the
 * un-linked note `25-48`'s own doc comment left for this item to resolve.
 */
export function ShellIdentity({ operator, siteId, tenancies, activeSiteId, onSwitchTenancy, onSignOut }: ShellIdentityProps) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initials = operatorInitials(operator);

  // Closes on the two routes a disclosure like this needs and `<details>` alone would not have
  // given us either (this component's own doc comment) - a pointer down outside the whole menu, or
  // Escape. Only attached while `open`, so a closed menu costs this component nothing. Escape also
  // returns focus to the trigger, the same restoration `Dialog`'s native `close()` gives its own
  // consumers for free.
  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // `13-07`'s own order survives unchanged: `ListMyTenanciesHandler` (`ago-chat`) already returns
  // tenancies sorted by name, and the deleted `TenancySwitcher` trusted that order rather than
  // re-sorting - this does too, for the identical reason (that component's own doc comment). Only
  // the active tenancy is removed, which is both this item's own "one row per *other* tenant"
  // wording and what makes "more than one tenancy" and "something to switch to" the same condition.
  const otherTenancies = useMemo(
    () => (tenancies ?? []).filter((tenancy) => tenancy.siteId !== activeSiteId),
    [tenancies, activeSiteId],
  );

  function tenancyLabel(tenancy: TenancyDto): string {
    // The identical disambiguated fallback `TenancySwitcher` used for a site with a real, empty
    // name (a seeded demo tenant predating `10-02`'s registration flow) - see that component's own
    // remarks for why an empty string is a real value here, not a missing one.
    return tenancy.siteName.trim().length > 0 ? tenancy.siteName : `${strings.unnamedSite} (${tenancy.siteId.slice(0, 8)})`;
  }

  // The menu header row's own second line - the active tenancy's real name when `tenancies` is
  // known, falling back to the bare site-id badge text every caller with no tenancy list already
  // showed before this item (`ShellIdentityProps.siteId`'s own doc comment). `null` renders no
  // second line at all - `OnboardingPage`/`RedeemInvitePage` pass `siteId={null}` because there is
  // truly no site yet, and a header row naming one would be false.
  const activeTenancy = tenancies?.find((tenancy) => tenancy.siteId === activeSiteId) ?? null;
  const currentTenantLabel = activeTenancy
    ? tenancyLabel(activeTenancy)
    : siteId
      ? `${strings.siteIdPrefix} ${siteId.slice(0, 8)}`
      : null;

  const triggerLabel = `${strings.userMenuAriaLabel}: ${operator}`;

  function closeAnd(action: () => void): () => void {
    return () => {
      setOpen(false);
      action();
    };
  }

  return (
    <div className="ago-user-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="ago-avatar ago-user-menu__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>

      {open && (
        <div className="ago-user-menu__panel" id={menuId}>
          {/* The header row - not clickable, an avatar-plus-caption restating who is signed in and
              where, the same information the closed trigger's own `aria-label` already carries for
              a screen reader, repeated here so a sighted reader who has just opened the menu does
              not have to remember what the initials behind it meant. */}
          <div className="ago-user-menu__header">
            <span className="ago-avatar ago-user-menu__header-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="ago-user-menu__header-text">
              <span className="ago-user-menu__header-name">{operator}</span>
              {currentTenantLabel && <span className="ago-user-menu__header-tenant">{currentTenantLabel}</span>}
            </span>
          </div>

          {/* `13-07`/`adr/0068`: only when there is a real choice to offer - see `otherTenancies`
              above for why this is the same condition the deleted `<select>` gated on. */}
          {otherTenancies.length > 0 && (
            <div className="ago-user-menu__section" role="group" aria-label={strings.tenancySwitcherLabel}>
              {otherTenancies.map((tenancy) => (
                <button
                  key={tenancy.siteId}
                  type="button"
                  className="ago-user-menu__item"
                  onClick={closeAnd(() => onSwitchTenancy?.(tenancy.siteId))}
                >
                  <TenantIcon className="ago-user-menu__item-icon" />
                  <span>{tenancyLabel(tenancy)}</span>
                </button>
              ))}
            </div>
          )}

          <hr className="ago-user-menu__separator" />

          <Link to="/appearance" className="ago-user-menu__item" onClick={() => setOpen(false)}>
            <AppearanceIcon className="ago-user-menu__item-icon" />
            <span>{strings.appearanceSettingsTitle}</span>
          </Link>

          <hr className="ago-user-menu__separator" />

          <button type="button" className="ago-user-menu__item" onClick={closeAnd(onSignOut)}>
            <SignOutIcon className="ago-user-menu__item-icon" />
            <span>{strings.signOut}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export interface PageHeadProps {
  title: string;
  description?: ReactNode;
  /** Status or secondary controls, rendered opposite the title. */
  aside?: ReactNode;
}

/**
 * The one `<h1>` per screen, plus whatever status belongs beside it. Part of the shell rather than
 * of the closed component set - it is page-frame furniture, the same way `<main>` is, and every
 * retrofitted screen renders exactly one.
 */
export function PageHead({ title, description, aside }: PageHeadProps) {
  return (
    <div className="ago-page-head">
      <div>
        <h1 className="ago-page-head__title">{title}</h1>
        {description && <p className="ago-page-head__description">{description}</p>}
      </div>
      {aside && <div className="ago-page-head__aside">{aside}</div>}
    </div>
  );
}

/**
 * A shell whose whole content is one centred message - the sign-in redirect, the OIDC callback, and
 * anything else with nothing to lay out. Also part of the frame rather than of the eleven.
 *
 * `12-04`: takes no `demoNoticeAudience`, deliberately. Every screen this renders is a screen where
 * nothing has been established about the reader yet - `CallbackPage` is literally the place where the
 * question is still being asked - so there is no answer to narrow the notice with, and the default is
 * both the honest and the stricter thing to say for the second or two it is on screen.
 */
export function CenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="ago-shell">
      <div className="ago-shell__sticky">
        <header className="ago-shell__header">
          <div className="ago-shell__header-row">
            {/* `23-31`: matches `AppShell`'s own brand block - "AGO Офис" and nothing else
                (`25-49`: renamed from "Офис"). */}
            <span className="ago-shell__brand">
              <span className="ago-shell__glyph" aria-hidden="true">
                A
              </span>
              <span className="ago-shell__wordmark">AGO Офис</span>
            </span>
          </div>
        </header>
        <PublicDemoNotice credentialsArePublished={false} />
      </div>
      <main className="ago-shell__centered" id="ago-main">
        {/* `23-41`: the same mount point as `AppShell`'s own `<main>` above, for the handful of
            pre-session screens (`CallbackPage`) that use this shell instead. */}
        <RenderErrorBoundary fallback={(_error, reset) => <RenderErrorAlert onRetry={reset} />}>
          {children}
        </RenderErrorBoundary>
      </main>
    </div>
  );
}
