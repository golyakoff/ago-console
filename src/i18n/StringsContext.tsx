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
 * The one provider is `OperatorShell` - the only place a specific tenant's locale is ever known.
 * `OwnerSitesPage` and every pre-session page (`/onboarding`, `/signup`, `/callback`) never provide
 * one, by design (confirmed with the author, `11-11`'s own backlog item): there is no tenant whose
 * language those pages could follow, and the default English they fall back to is the correct
 * behaviour, not a gap.
 */
const StringsContext = createContext<ConsoleStrings>(en);

export const StringsProvider = StringsContext.Provider;

export function useStrings(): ConsoleStrings {
  return useContext(StringsContext);
}
