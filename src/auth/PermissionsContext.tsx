import { createContext, useContext } from "react";

export interface PermissionsState {
  /** `null` while the first `GET /api/v1/operators/me` call is still in flight - callers that need
   * to gate a whole page (`AdminConversationsPage`) should treat this as "not yet known", not "no
   * permissions", the same way `QueuePage`'s own `queue === null` means "still loading". */
  permissions: string[] | null;
  /** `11-02`: the signed-in operator's own site, from the same `GET /api/v1/operators/me` response -
   * `WidgetConfigPage` needs this to build `11-01`'s site-scoped URL (`GET`/`PUT
   * /api/v1/sites/{siteId}/widget-config`), the same reason that endpoint reads `siteId` from the
   * route rather than a token claim (`WidgetConfigEndpoints`'s own remarks: an operator's own site
   * claim is not necessarily the site being configured - here the two happen to be the same site, but
   * the endpoint itself does not assume that). `null` under the identical "not yet known" rule
   * `permissions` already follows. */
  siteId: string | null;
  hasPermission: (permission: string) => boolean;
}

export const PermissionsContext = createContext<PermissionsState | null>(null);

/** `5-08`: throws outside `PermissionsProvider` on purpose, the same reasoning `useAuth`/
 * `useOperatorConnection` already established - every route that needs this is already inside the
 * shared layout route that mounts it (`App.tsx`). */
export function usePermissions(): PermissionsState {
  const context = useContext(PermissionsContext);
  if (context === null) {
    throw new Error("usePermissions() called outside <PermissionsProvider>.");
  }

  return context;
}
