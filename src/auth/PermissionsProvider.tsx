import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext.js";
import { fetchMyPermissions } from "../api/operatorsApi.js";
import { fetchMyTenancies, type TenancyDto } from "../api/tenanciesApi.js";
import { setActiveSiteId as setActiveSiteIdSignal } from "../api/activeSite.js";
import { PermissionsContext, type PermissionsState } from "./PermissionsContext.js";
import { resolveActiveSite, writeStoredActiveSite } from "./activeSiteStorage.js";

/**
 * `5-08`: fetches `GET /api/v1/operators/me` once per signed-in session and exposes the result
 * through `usePermissions()` - the console's own gap, found while building this item
 * (`GetMyPermissionsHandler`'s own remarks, `ago-chat`): nothing before this let any page ask "can
 * the signed-in operator do X" without a hardcoded guess. Mounted at the same shared layout-route
 * level as `OperatorConnectionProvider` (`App.tsx`) - one fetch per session, not one per page.
 *
 * Split from `PermissionsContext.tsx` for the same Fast-Refresh reason `OperatorConnectionProvider`/
 * `OperatorConnectionContext` already are (that provider's own doc comment has the detail).
 *
 * `13-07`/`adr/0068`: gained a step *before* the `operators/me` call - `GET /api/v1/me/tenancies`.
 * Zero tenancies: proceeds to `operators/me` exactly as before this item (the pre-onboarding case,
 * `resolveOperatorState`/`CallbackPage` own routing away from here - this provider does not special-
 * case it, since not sending any header is already what an absent/empty list produces). One or more:
 * resolves the active site (`resolveActiveSite` above), sets it on the shared
 * `src/api/activeSite.ts` singleton *before* calling `operators/me`, so that call - and every one
 * after it - already carries the header. Both fetches are sequenced (not `Promise.all`) precisely so
 * the active-site signal exists before the second request is built.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [tenancies, setTenancies] = useState<TenancyDto[] | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` (the route this is always mounted inside) guarantees a signed-in user by the
      // time children render - same "reaching here is a wiring bug" reasoning
      // `OperatorConnectionProvider` already states for its own equivalent check.
      return;
    }

    let cancelled = false;
    fetchMyTenancies(accessToken)
      .then((tenanciesResponse) => {
        if (cancelled) {
          return undefined;
        }

        setTenancies(tenanciesResponse.tenancies);
        const resolved = resolveActiveSite(tenanciesResponse.tenancies);
        setActiveSiteId(resolved);
        // Set before the next fetch is built, not after - this is the one line that makes the
        // subsequent `operators/me` call (and every API/hub call after it) carry the header.
        setActiveSiteIdSignal(resolved);

        return fetchMyPermissions(accessToken);
      })
      .then((response) => {
        if (!response || cancelled) {
          return;
        }

        setPermissions(response.permissions);
        // `11-02`: the same response already carries `siteId` - one fetch, two pieces of state,
        // not a second call `WidgetConfigPage` would otherwise need to make on its own.
        setSiteId(response.siteId);
        // `11-11`(console): same response, same reasoning, one more field.
        setLocale(response.locale);
      })
      .catch((err: unknown) => {
        // A permissions fetch failing must not crash the console - every gated UI element (the admin
        // nav link, the attachment-delete button) simply stays hidden, the same fail-closed default
        // an empty `permissions` array already produces. Logged, not swallowed silently, so a real
        // wiring bug is still visible in the console's own dev tools. Covers a `fetchMyTenancies`
        // failure too, now that it is the first link in this same chain - `tenancies` simply stays
        // `null` ("not yet known"), the identical fail-soft `permissions` already had.
        console.error("Failed to load operator permissions", err);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const hasPermission = useCallback((permission: string) => permissions?.includes(permission) ?? false, [permissions]);

  // `13-07`: persists the choice, then reloads - the backlog item's own time-boxed "full remount of
  // the operator-scoped part of the app is an acceptable, simple way to do this" (Scope), taken
  // literally rather than reimplemented as a React-level remount-by-key. A reload is simpler and more
  // bulletproof than a key on this provider (or the layout route above it) would be: it resets every
  // piece of state this item touches - this provider's own, `OperatorConnectionProvider`'s hub
  // connection, and anything else a future page adds - without this file having to enumerate them, at
  // the cost of a visible full-page flash a more surgical remount would avoid. Stated as a deliberate
  // trade, not an oversight: nothing about this session is lost by a reload (the OIDC session lives in
  // `localStorage` via `oidc-client-ts`, unaffected).
  const switchTenancy = useCallback((newSiteId: string) => {
    writeStoredActiveSite(newSiteId);
    window.location.reload();
  }, []);

  const value = useMemo<PermissionsState>(
    () => ({ permissions, siteId, locale, hasPermission, tenancies, activeSiteId, switchTenancy }),
    [permissions, siteId, locale, hasPermission, tenancies, activeSiteId, switchTenancy],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
