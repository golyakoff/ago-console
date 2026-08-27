import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "../components/Button.js";
import { config } from "../config.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `12-04`: who the notice below is talking to. Two values, because the demo console has exactly two
 * kinds of signed-in reader and one sentence that is true of only one of them.
 *
 * `"shared-login"` is the default everywhere, and that direction is the safe one on purpose: it is
 * the stricter notice, so a caller that forgets to pass this - or a new route added later that never
 * learns about it - understates nothing. The value is only ever narrowed by a caller that has the
 * server's own answer in hand.
 */
export type DemoNoticeAudience = "shared-login" | "platform-owner";

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
 * **`12-04`: *whether* it appears still reads `config`; *what it says* now takes a
 * `DemoNoticeAudience` prop.** Those are different questions and the argument above only
 * settles the first. "Its login is published on the demo pages, so anyone can sign in here" is false
 * of the platform owner's account - that login is published nowhere and is held by one person - and a
 * standing disclosure that is verifiably false to its reader is worth less than no disclosure,
 * because it teaches them the strip is boilerplate. `8-11` made the widget's own notice follow the
 * tenant rather than the page for the same reason, and an identity is the same kind of fact as a
 * tenant here.
 *
 * The prop's failure mode is the inverse of the one the paragraph above rejects: forgetting to pass
 * it shows the *stricter* text, never nothing at all. What no variant drops is the part that is true
 * for every reader - the conversations are strangers', and nothing real should be typed here.
 */
function PublicDemoNotice({ audience }: { audience: DemoNoticeAudience }) {
  const strings = useStrings();
  if (!config.isPublicDemo) {
    return null;
  }

  return (
    <div className="ago-demo-notice">
      {/* The band is full-bleed; the sentence inside it is capped and centred on the same
          `--ago-shell-max` measure as the header row above, so it starts on the brand's own left
          edge instead of running the whole width of a 1440px monitor. */}
      <span className="ago-demo-notice__text">
        {audience === "platform-owner" ? strings.publicDemoNoticePlatformOwner : strings.publicDemoNoticeSharedLogin}
      </span>
    </div>
  );
}

export interface AppShellNavItem {
  to: string;
  label: string;
  /** `NavLink`'s own `end` - `/` would otherwise match every route below it. */
  end?: boolean;
}

export interface AppShellProps {
  /** Already filtered by the caller. `OperatorShell` is where the permission gate lives; this
   * component renders whatever list it is handed and makes no authorization decision of its own. */
  nav?: AppShellNavItem[];
  /** The signed-in operator block, sign-out included. Absent on the pre-session routes
   * (`/signup`, `/callback`), where there is nobody to name. */
  identity?: ReactNode;
  /**
   * `11-06`: the route below is a workspace, not a document - it should use the full shell width and
   * fit the viewport, with its own regions scrolling internally rather than the page scrolling as a
   * whole.
   *
   * It is a prop rather than something the shell works out for itself because `AppShell` reads no
   * context and knows no routes, deliberately (see this component's own doc comment) - the caller
   * that already knows which route is rendering is the one that can answer this. The default is the
   * reading-width, page-scrolling layout every other screen wants; a 1180px-wide line of 15px text
   * is past the readable measure, which is why the cap exists at all.
   */
  wide?: boolean;
  /**
   * `12-04`: who the `8-06` demo strip is addressing, when this build is the public demo one. Passed
   * only by the callers that hold the server's own answer about this identity - `OperatorShell` and
   * `OnboardingPage` (from `useOwnerEligibility`) and `OwnerSitesPage` (from its own accepted
   * request). Everything else omits it and gets the stricter shared-login wording, which is the
   * correct thing to say to a reader nobody has established anything about.
   */
  demoNoticeAudience?: DemoNoticeAudience;
  children: ReactNode;
}

/**
 * `11-05`. The persistent frame every route renders inside: product identity, navigation with an
 * active state, the signed-in operator, and the page underneath.
 *
 * Deliberately presentational and prop-driven for everything that varies by *route* - it reads no
 * context for `nav`/`identity`/`wide`. That is what lets the same header sit on `/signup` and
 * `/callback`, which mount outside `PermissionsProvider` and `OperatorConnectionProvider` entirely
 * (`App.tsx` has the reasoning for why those routes are outside the operator layout), where a shell
 * that called `usePermissions()` would throw. The context-reading half of *that* lives in
 * `OperatorShell`, which is mounted only inside those providers.
 *
 * `11-11`: this component's own chrome text (the skip link, the tagline, nav's aria-label, the demo
 * notice) *does* read `useStrings()` now - safe specifically because that context is defaulted, not
 * nullable (`StringsContext.tsx`'s own remarks): a caller with no `<StringsProvider>` above it (every
 * pre-session route) gets the console's built-in English rather than a thrown error, so the "renders
 * outside every provider" property this doc comment describes still holds. `nav`/`identity`/`wide`
 * remain props, not context, because those genuinely vary by *route*, which this component still
 * knows nothing about - `useStrings()` varies only by *tenant*, which a safe default can stand in for.
 *
 * The `<header>`/`<nav>`/`<main>` landmarks and the skip link are the point of having a shell at
 * all from an accessibility standpoint: before this, every screen was a bare `<div>` and a
 * keyboard user had no way past the navigation.
 */
export function AppShell({
  nav,
  identity,
  wide = false,
  demoNoticeAudience = "shared-login",
  children,
}: AppShellProps) {
  const strings = useStrings();
  return (
    <div className={wide ? "ago-shell ago-shell--fixed" : "ago-shell"}>
      <a className="ago-skip-link" href="#ago-main">
        {strings.skipToContent}
      </a>
      <header className="ago-shell__header">
        {/* `13-07`-era header found live to wrap onto a surprise second line once a fifth nav item
            (`Platform sites`) joined the other four: one row asked `justify-content: space-between`
            to fit brand + nav + identity at once, and nothing in that row could shrink, so the whole
            row broke rather than any one piece of it. Split deliberately into two rows instead - "who
            you are" (brand, tenancy switcher, operator, sign out) on top, "where you can go" (nav)
            underneath, each free of the other's width - so wrapping stops being a function of how many
            nav items happen to be gated on for this identity today. */}
        <div className="ago-shell__header-row">
          <span className="ago-shell__brand">
            <span className="ago-shell__glyph" aria-hidden="true">
              A
            </span>
            <span>
              <span className="ago-shell__wordmark">AGO</span>
              <span className="ago-shell__product">{strings.operatorConsoleTagline}</span>
            </span>
          </span>

          {identity && <div className="ago-shell__identity">{identity}</div>}
        </div>

        {nav && nav.length > 0 && (
          <div className="ago-shell__header-row ago-shell__header-row--nav">
            <nav className="ago-shell__nav" aria-label={strings.navSectionsAriaLabel}>
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? "ago-shell__nav-link ago-shell__nav-link--active" : "ago-shell__nav-link"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <PublicDemoNotice audience={demoNoticeAudience} />

      <main className={wide ? "ago-shell__main ago-shell__main--wide" : "ago-shell__main"} id="ago-main">
        {children}
      </main>
    </div>
  );
}

export interface ShellIdentityProps {
  /** `preferred_username`, falling back to the subject id - the same expression the pre-`11-05`
   * pages already printed, unchanged. */
  operator: string;
  /** The operator's own site, when it is known. `null` on `/onboarding`, where the whole point is
   * that there is not one yet. */
  siteId?: string | null;
  /** `13-07`/`adr/0068`: the tenancy switcher (`TenancySwitcher`), already gated by its caller
   * (`OperatorShell`) to render only for a multi-tenant identity. `undefined` everywhere else, the
   * same "renders nothing extra" default every other optional shell slot already has - a
   * single-tenant operator's header is unchanged from before this item. */
  tenancySwitcher?: ReactNode;
  onSignOut: () => void;
}

/**
 * The right-hand end of the header: who is signed in, which site they are working on, and the way
 * out. Frame furniture, not one of the eleven - it exists so the two shells that render it
 * (`OperatorShell` and `OnboardingPage`, which is outside the operator providers) cannot drift.
 *
 * Before `11-05` this was a `<button>` inside a `<p>` at the top of two page bodies, which is why
 * signing out looked like a sentence.
 */
export function ShellIdentity({ operator, siteId, tenancySwitcher, onSignOut }: ShellIdentityProps) {
  const strings = useStrings();
  return (
    <>
      {tenancySwitcher}
      <span className="ago-shell__operator">
        <span className="ago-shell__operator-name">{operator}</span>
        {siteId && (
          <span className="ago-shell__operator-site" title={strings.siteIdTooltip}>
            {strings.siteIdPrefix} {siteId.slice(0, 8)}
          </span>
        )}
      </span>
      <Button size="sm" variant="secondary" onClick={onSignOut}>
        {strings.signOut}
      </Button>
    </>
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
      <header className="ago-shell__header">
        <div className="ago-shell__header-row">
          <span className="ago-shell__brand">
            <span className="ago-shell__glyph" aria-hidden="true">
              A
            </span>
            <span>
              <span className="ago-shell__wordmark">AGO</span>
              <span className="ago-shell__product">Operator console</span>
            </span>
          </span>
        </div>
      </header>
      <PublicDemoNotice audience="shared-login" />
      <main className="ago-shell__centered" id="ago-main">
        {children}
      </main>
    </div>
  );
}
