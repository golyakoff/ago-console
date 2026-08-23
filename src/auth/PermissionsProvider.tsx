import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext.js";
import { fetchMyPermissions } from "../api/operatorsApi.js";
import { PermissionsContext, type PermissionsState } from "./PermissionsContext.js";

/**
 * `5-08`: fetches `GET /api/v1/operators/me` once per signed-in session and exposes the result
 * through `usePermissions()` - the console's own gap, found while building this item
 * (`GetMyPermissionsHandler`'s own remarks, `ago-chat`): nothing before this let any page ask "can
 * the signed-in operator do X" without a hardcoded guess. Mounted at the same shared layout-route
 * level as `OperatorConnectionProvider` (`App.tsx`) - one fetch per session, not one per page.
 *
 * Split from `PermissionsContext.tsx` for the same Fast-Refresh reason `OperatorConnectionProvider`/
 * `OperatorConnectionContext` already are (that provider's own doc comment has the detail).
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` (the route this is always mounted inside) guarantees a signed-in user by the
      // time children render - same "reaching here is a wiring bug" reasoning
      // `OperatorConnectionProvider` already states for its own equivalent check.
      return;
    }

    let cancelled = false;
    fetchMyPermissions(accessToken)
      .then((response) => {
        if (!cancelled) {
          setPermissions(response.permissions);
        }
      })
      .catch((err: unknown) => {
        // A permissions fetch failing must not crash the console - every gated UI element (the admin
        // nav link, the attachment-delete button) simply stays hidden, the same fail-closed default
        // an empty `permissions` array already produces. Logged, not swallowed silently, so a real
        // wiring bug is still visible in the console's own dev tools.
        console.error("Failed to load operator permissions", err);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const hasPermission = useCallback((permission: string) => permissions?.includes(permission) ?? false, [permissions]);

  const value = useMemo<PermissionsState>(() => ({ permissions, hasPermission }), [permissions, hasPermission]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
