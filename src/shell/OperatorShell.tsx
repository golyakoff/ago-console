import { Outlet, useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { AppShell, ShellIdentity, type AppShellNavItem } from "./AppShell.js";

/**
 * `11-05`. The layout route's element - the context-reading half of the shell, mounted inside
 * `RequireAuth` / `PermissionsProvider` / `OperatorConnectionProvider` (`App.tsx`), which is what
 * makes `usePermissions()` legal here and illegal in `AppShell` itself.
 *
 * Navigation is gated through the *existing* `usePermissions()` hook rather than a new mechanism,
 * exactly as the item asks. This is the same client-side hide `QueuePage` already did with its
 * `hasPermission("site:configure") && <Link>` pair, moved into the shell and given an active state -
 * so it carries the same caveat, and it is worth restating rather than losing in the move: hiding a
 * link is UI, never the gate. `AdminConversationsPage` and `WidgetConfigPage` each still check the
 * permission themselves on mount, and `11-01`'s and `5-08`'s server-side `IPermissionChecker` checks
 * are what actually refuse an operator who types the URL in directly.
 *
 * While `permissions` is still `null` (the first `GET /api/v1/operators/me` in flight) the gated
 * items are simply absent - the same "not yet known is not the same as denied" rule
 * `PermissionsContext` documents. They appear a moment later; the alternative, rendering them
 * optimistically and removing them, is worse, because a link that vanishes under the pointer is a
 * usability bug and a link that 403s is a lie.
 */
export function OperatorShell() {
  const { user, logout } = useAuth();
  const { siteId, hasPermission } = usePermissions();

  // `11-06`: the two workspace routes want the full-width, viewport-height frame; `/admin` and
  // `/settings/widget` are ordinary documents and keep the reading-width one. Asked as two route
  // matches here rather than answered inside `AppShell`, which reads no context and knows no routes
  // on purpose.
  // Both hooks are called unconditionally and combined afterwards - `||` between two `useMatch`
  // calls would short-circuit the second one and change the hook order between renders.
  const queueMatch = useMatch("/");
  const conversationMatch = useMatch("/conversations/:conversationId");
  const isWorkspace = queueMatch !== null || conversationMatch !== null;

  const nav: AppShellNavItem[] = [{ to: "/", label: "Conversations", end: true }];
  if (hasPermission("site:configure")) {
    nav.push({ to: "/admin", label: "All conversations" });
    nav.push({ to: "/settings/widget", label: "Widget appearance" });
  }

  return (
    <AppShell
      nav={nav}
      wide={isWorkspace}
      identity={
        <ShellIdentity
          operator={user?.profile.preferred_username ?? user?.profile.sub ?? "Signed in"}
          siteId={siteId}
          onSignOut={() => void logout()}
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
