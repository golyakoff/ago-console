import { createContext, useContext } from "react";
import { en } from "./en.js";
import type { ConsoleStrings } from "./strings.js";

/**
 * `11-11`: **defaulted, not nullable** - unlike `PermissionsContext`/`AuthContext`, which throw
 * `useX() called outside <XProvider>` on purpose (every route that needs them is already inside the
 * layout route that mounts them), this context's default value is the console's own built-in
 * English, the same "a bad or missing locale must never be the reason something fails to render"
 * rule `ago-widget`'s `parseWidgetLocale` established for the widget side of this same feature.
 *
 * This is deliberate and load-bearing for `AppShell`'s own architecture: that component "reads no
 * context" so the identical header can sit on `/signup`/`/callback` (outside every provider) as well
 * as inside the operator layout (`AppShell.tsx`'s own doc comment). Reading `useStrings()` from
 * `AppShell` would break that property unless the context has a safe default to fall back to - which
 * is exactly what this gives it, rather than threading every one of `ConsoleStrings`' fields through
 * as individual props.
 *
 * The one provider that resolves a *tenant's* locale is `OperatorShell`. `OwnerSitesPage` is the one
 * page that deliberately never provides one at all (`11-11`'s own settled call, restated in that
 * page's own doc comment: `/owner` is not scoped to one tenant, so it always falls through to this
 * bare `en` default, on purpose, forever).
 *
 * `23-28`: **the four pre-session pages are a third case, not the same as `/owner`'s.** Before this
 * item they also fell through to this bare default - the doc comment here used to call that "the
 * correct behaviour, not a gap", reasoning that there is no tenant whose language they could follow.
 * The author's answer (`docs/backlog/23-28-*.md`, 2026-09-05) rejects that premise rather than the
 * conclusion: a locale does not have to be *derived* from a tenant to be chosen - for a product
 * selling to Russian shops, Russian is the correct default for "nobody has told us yet", not a guess
 * standing in for a missing signal. So `/callback`, `/signup`, `/onboarding` and `/redeem-invite` now
 * wrap themselves in `PreSessionStringsProvider` (`PreSessionStringsProvider.tsx`, used from
 * `App.tsx`'s four route elements) rather than relying on this bare default - kept in its own file
 * rather than beside `useStrings()` here purely because `react-refresh/only-export-components` flags
 * a file that exports both a component and a hook once it holds more than one component's worth of
 * reason to exist; nothing about the split changes which file owns the *decision*, which is this one
 * - the bare `en` below stays exactly what it was for every other caller (`/owner`'s permanent
 * English, and the safety net for a route this file's own author has not yet wired to either
 * provider), and is deliberately *not* changed to `ru` itself: doing that would silently widen
 * `/owner` into Russian too the moment its own signed-in identity's tenancy happens to be one, which
 * is precisely the "must not quietly widen itself" trap the backlog item warns against - `/owner`'s
 * English has to keep coming from a fact about `/owner`, not from every unwired route happening to
 * agree with it today.
 */
const StringsContext = createContext<ConsoleStrings>(en);

export const StringsProvider = StringsContext.Provider;

export function useStrings(): ConsoleStrings {
  return useContext(StringsContext);
}
