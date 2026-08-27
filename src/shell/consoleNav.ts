import type { AppShellNavItem } from "./AppShell.js";

/**
 * `13-07`/`adr/0063`/`4-06`(console): the tenant-scoped half of the console's navigation, shared
 * between `OperatorShell` (always builds it - nothing renders that shell without a resolved operator
 * seat) and `OwnerSitesPage` (builds it only when this identity also holds a seat, the "orthogonal
 * axes" case `adr/0063`/`12-05` argue for). Before this, `OwnerSitesPage` offered a single
 * "Back to the console" link instead of this list, which is why a platform owner who is also an
 * operator lost the whole console nav - Conversations, the site-scoped screens, the lot - the moment
 * they clicked "Platform sites", and had to use that one link to leave `/owner` rather than
 * navigating like anywhere else in the shell.
 *
 * "Conversations" is unconditional here on purpose, matching `permissionGating.test.tsx`'s own
 * "offers nothing gated while the answer is still in flight" case: `hasPermission` alone gates the
 * other three, never a still-loading `siteId` - `OperatorShell` never had a `siteId` check on this
 * first item, and this keeps that exact behaviour rather than introducing one.
 */
export function buildTenantNavItems(hasPermission: (permission: string) => boolean): AppShellNavItem[] {
  const items: AppShellNavItem[] = [{ to: "/", label: "Conversations", end: true }];
  if (hasPermission("site:configure")) {
    items.push({ to: "/admin", label: "All conversations" });
    items.push({ to: "/settings/widget", label: "Widget appearance" });
    // `14-04`: same permission, same place - one more tenant self-service setting.
    items.push({ to: "/settings/auto-reply", label: "Offline auto-reply" });
  }

  return items;
}
