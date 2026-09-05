import type { ReactNode } from "react";
import { ru } from "./ru.js";
import { StringsProvider } from "./StringsContext.js";

/**
 * `23-28`: the one place that says *which* Russian - every one of the four pre-session routes
 * (`/callback`, `/signup`, `/onboarding`, `/redeem-invite`) wraps itself in this rather than reaching
 * for `<StringsProvider value={ru}>` directly, so the decision lives in one file instead of being
 * repeated at each of `App.tsx`'s four route elements (and so a fifth pre-session route, if one is
 * ever added, has an obvious thing to reach for instead of a bare default it would have to remember
 * to override). `StringsContext.tsx`'s own doc comment has the full reasoning for *why* Russian - this
 * file only says it, and is a separate file from that one purely because
 * `react-refresh/only-export-components` refuses to co-locate a component export with the
 * `useStrings()` hook once there is a real component in the file to protect.
 */
export function PreSessionStringsProvider({ children }: { children: ReactNode }) {
  return <StringsProvider value={ru}>{children}</StringsProvider>;
}
