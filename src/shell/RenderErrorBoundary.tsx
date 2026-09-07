import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `23-41`: what `docs/backlog/23-41-*.md` found by accident while landing `23-31` - one absent field
 * (`CalendarTenancy.tenantName`, typed `string`, actually `undefined` because a test fixture answered
 * with the wrong body) threw during `CalendarElsewhereNotice`'s render, and an uncaught render-phase
 * throw anywhere unmounts the *entire* React tree. The result was a blank `<body>`: no error, no
 * partial screen, nothing a tenant could report beyond "it is broken".
 *
 * <b>The chosen reading, out of the item's own three.</b> Reading 3 (validate every API response at
 * the boundary, so a contract breach becomes an ordinary caught error rather than a render crash) is
 * explicitly out of scope - the item's own words, "its own item if it is chosen" - so this is reading
 * 1 and 2 together: an error boundary bounds the damage, it does not remove the underlying class of
 * cause. `CalendarElsewhereNotice.tsx`'s `tenancy.tenantName.trim()` is deliberately left exactly as
 * fragile as it was found; the boundary is what stops the *next* fragile accessor, wherever it turns
 * out to be, from taking the whole console down with it.
 *
 * <b>React still has no hook for this.</b> `getDerivedStateFromError`/`componentDidCatch` only exist
 * on a class component - this is the one class component in the console, kept to exactly what React
 * demands rather than adding `react-error-boundary` as a dependency for what amounts to thirty lines
 * (`CLAUDE.md`: a package has to replace something and hand-rolling has to be worse).
 *
 * <b>One mechanism, three mount points - not forty per-screen fallbacks.</b> Every one of them
 * renders through this same class and the same `RenderErrorAlert` below:
 * - `main.tsx`, around the whole `<App />` - the outermost net, for anything above or outside a
 *   `Router` (a provider's own render throwing, for instance).
 * - `AppShell`/`CenteredShell`'s own `{children}` - every screen in the console renders through one
 *   of these two (`AppShell.tsx`'s own doc comment: "the persistent frame every route renders
 *   inside"), so wrapping this one spot, once, is what a future screen inherits automatically rather
 *   than something it has to remember to opt into.
 * - `OperatorShell`'s own `<Outlet />` - see that file's own doc comment for why this third mount
 *   point is not redundant with `AppShell`'s: `OperatorShell` (and the `AppShell` it renders) is
 *   mounted *once* for the whole signed-in session, and React Router only swaps what `<Outlet />`
 *   resolves to underneath it - an `AppShell`-level boundary with no reset would keep showing a
 *   tripped fallback for a screen the operator has since navigated away from.
 */
export interface RenderErrorBoundaryProps {
  children: ReactNode;
  /** A render-prop rather than a fixed element: it runs inside this class's own `render()`, so it
   * must return JSX describing components (safe for those components to call hooks in their own
   * render), never call a hook itself in the callback body. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** `23-41`'s own logging seam - nothing observes this yet, structured so a future item can add one
   * line to send it to OpenTelemetry without touching any of the three call sites above. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface RenderErrorBoundaryState {
  error: Error | null;
}

export class RenderErrorBoundary extends Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  state: RenderErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RenderErrorBoundaryState {
    // React's own contract types this `unknown` - a `throw "a string"` or `throw 42` is legal JS,
    // however rare in practice. `String(error)` on an arbitrary `unknown` is exactly what
    // `@typescript-eslint/no-base-to-string` exists to catch, so this matches `CallbackPage.tsx`'s
    // own `err instanceof Error ? err.message : strings.callbackUnknownError` idiom instead: a fixed
    // message for the case that is not a real `Error`, never a blind stringification of it.
    return { error: error instanceof Error ? error : new Error("A component threw a non-Error value during render.") };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return this.props.fallback(error, this.reset);
    }

    return this.props.children;
  }
}

/**
 * The one fallback every mount point above renders - `Alert tone="danger"`, the identical component
 * and tone every page already uses for a failed fetch (`CalendarBookingsPage`'s own `error !== null`
 * branch, for one). Deliberately the *same* vocabulary a caught fetch error already uses, not a
 * fourth one invented for this - and deliberately not the empty-state vocabulary
 * (`Panel`/`Skeleton`/"nothing here yet") `23-34`/`20-30` established: an empty account and a broken
 * screen must never render identically, which is the failure this whole item is about.
 *
 * Says what is actually known (something did not arrive in the shape this screen expected) and one
 * concrete next step (retry in place; reload if that keeps failing) - never "an unexpected error
 * occurred", which is true of every possible cause and actionable for none of them.
 */
export function RenderErrorAlert({ onRetry }: { onRetry: () => void }) {
  const strings = useStrings();

  return (
    <Alert
      tone="danger"
      title={strings.renderErrorTitle}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {strings.renderErrorRetryButton}
        </Button>
      }
    >
      {strings.renderErrorMessage}
    </Alert>
  );
}
