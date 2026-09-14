import type { ReactNode } from "react";
import { ru } from "./ru.js";
import { StringsProvider } from "./StringsProvider.js";

/**
 * `25-89`: the owner panel's own answer to the same question `23-28` answered for the four
 * pre-session routes - "this route has no tenant to read a locale from; what does it render?" - is
 * the identical one: Russian, chosen rather than defaulted to. `App.tsx`'s five `/owner/*` routes wrap
 * themselves in this rather than reaching for `<StringsProvider value={ru}>` directly, the same
 * "the decision lives in one file, not repeated at every route element" reasoning
 * `PreSessionStringsProvider.tsx`'s own doc comment gives for itself.
 *
 * **Not `PreSessionStringsProvider` itself**, even though the two are the same three lines, because
 * the name would stop fitting the moment someone read it at a call site: `/owner` is reached by a
 * signed-in platform owner, not a visitor with no session yet, so "pre-session" would be describing a
 * state that is not true here. `StringsContext.tsx`'s own doc comment has the fuller history - `/owner`
 * was `11-11`'s original "always English, permanently, by design" case, which is what made it the one
 * page `PreSessionStringsProvider` (built for `23-28`, after `/owner`'s own English had already been
 * settled) never had reason to cover. `25-88`'s investigation into flipping `StringsContext`'s own bare
 * default is the reason this page could not simply inherit a tenant's locale the way an operator route
 * does (562 test failures across 69 files, that item's own Outcome) - so this item gives `/owner` the
 * same *kind* of fix `23-28` gave those four routes, under its own name, rather than either widening
 * the bare default or borrowing a provider whose name asserts something untrue about who is looking at
 * this screen.
 *
 * **Why Russian, not English**, now that `/owner` is choosing rather than falling through: the product
 * sells to Russian-speaking shops, and every other reader of this console who *can* be given a real
 * language sees Russian - `11-11`'s own settled answer for the operator side of the product, and
 * `23-28`'s for the four pre-session routes. A platform owner reading `/owner` is exactly as real a
 * reader as either of those, and there was never a considered reason to leave this one screen as the
 * sole English holdout - only the absence, until this item, of a safe way to give it anything else
 * without widening `StringsContext`'s own bare default (`25-88`'s finding, restated in this file's own
 * remarks above).
 */
export function OwnerStringsProvider({ children }: { children: ReactNode }) {
  return <StringsProvider value={ru}>{children}</StringsProvider>;
}
