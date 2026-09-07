import { StringsContext } from "./StringsContext.js";

/**
 * `23-97`: split out of `StringsContext.tsx` the same way `AuthProvider.tsx`/`AuthContext.tsx` and
 * `OperatorConnectionProvider.tsx`/`OperatorConnectionContext.tsx` already are - a file that exports
 * both a component and a plain function (here, the `useStrings()` hook) breaks Vite's Fast Refresh
 * for the component (`react-refresh/only-export-components`). Unlike those two, there is no real
 * component logic to move: `StringsProvider` is - and was, before this split - nothing more than
 * `StringsContext.Provider` under a name that does not require every caller to know the underlying
 * context object's name. `StringsContext.tsx`'s own doc comment has the fuller reasoning for why the
 * split runs this direction rather than the other.
 */
export const StringsProvider = StringsContext.Provider;
