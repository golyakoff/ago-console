import { createContext, useContext } from "react";

export interface PermissionsState {
  /** `null` while the first `GET /api/v1/operators/me` call is still in flight - callers that need
   * to gate a whole page (`AdminConversationsPage`) should treat this as "not yet known", not "no
   * permissions", the same way `QueuePage`'s own `queue === null` means "still loading". */
  permissions: string[] | null;
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
