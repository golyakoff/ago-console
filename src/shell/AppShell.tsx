import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "../components/Button.js";

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
  children: ReactNode;
}

/**
 * `11-05`. The persistent frame every route renders inside: product identity, navigation with an
 * active state, the signed-in operator, and the page underneath.
 *
 * Deliberately presentational and prop-driven - it reads no context. That is what lets the same
 * header sit on `/signup` and `/callback`, which mount outside `PermissionsProvider` and
 * `OperatorConnectionProvider` entirely (`App.tsx` has the reasoning for why those routes are
 * outside the operator layout), where a shell that called `usePermissions()` would throw. The
 * context-reading half lives in `OperatorShell`, which is mounted only inside those providers.
 *
 * The `<header>`/`<nav>`/`<main>` landmarks and the skip link are the point of having a shell at
 * all from an accessibility standpoint: before this, every screen was a bare `<div>` and a
 * keyboard user had no way past the navigation.
 */
export function AppShell({ nav, identity, wide = false, children }: AppShellProps) {
  return (
    <div className={wide ? "ago-shell ago-shell--fixed" : "ago-shell"}>
      <a className="ago-skip-link" href="#ago-main">
        Skip to content
      </a>
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

          {nav && nav.length > 0 && (
            <nav className="ago-shell__nav" aria-label="Console sections">
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
          )}

          {identity && <div className="ago-shell__identity">{identity}</div>}
        </div>
      </header>

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
export function ShellIdentity({ operator, siteId, onSignOut }: ShellIdentityProps) {
  return (
    <>
      <span className="ago-shell__operator">
        <span className="ago-shell__operator-name">{operator}</span>
        {siteId && (
          <span className="ago-shell__operator-site" title="Site id">
            site {siteId.slice(0, 8)}
          </span>
        )}
      </span>
      <Button size="sm" variant="secondary" onClick={onSignOut}>
        Sign out
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
      <main className="ago-shell__centered" id="ago-main">
        {children}
      </main>
    </div>
  );
}
