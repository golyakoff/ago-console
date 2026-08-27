import { createContext, useContext } from "react";
import type { TenancyDto } from "../api/tenanciesApi.js";

export interface PermissionsState {
  /** `null` while the first `GET /api/v1/operators/me` call is still in flight - callers that need
   * to gate a whole page (`AdminConversationsPage`) should treat this as "not yet known", not "no
   * permissions", the same way the workspace's own `queue === null` means "still loading". */
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
  /** `13-07`/`adr/0068`: every tenancy (`Site`) this signed-in identity administers, from
   * `GET /api/v1/me/tenancies` - the new step `PermissionsProvider` takes before its existing
   * `operators/me` call. `null` while that call is still in flight, `[]` once it resolves for an
   * identity with none (the pre-onboarding case) - the same "not yet known is not the same as
   * denied/empty" distinction `permissions` already draws. The switcher
   * (`OperatorShell`/`TenancySwitcher`) renders only when this holds more than one entry. */
  tenancies: TenancyDto[] | null;
  /** The tenancy `PermissionsProvider` resolved as active for this session - the same value it
   * attaches as `X-Ago-Active-Site` on every subsequent API/hub call
   * (`src/api/activeSite.ts`). `null` only while unresolved. */
  activeSiteId: string | null;
  /** Switches the active tenancy: persists the new choice and reloads the page.
   * `PermissionsProvider`'s own doc comment explains why a full reload, not a React-level remount,
   * is this item's own time-boxed choice for "re-bootstrap everything that depends on the active
   * site" (`13-07`'s backlog Scope explicitly allows it). A no-op when `tenancies` holds one entry
   * or fewer - nothing to switch to. */
  switchTenancy: (siteId: string) => void;
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
