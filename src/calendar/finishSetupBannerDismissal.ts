/**
 * `26-330`: where "hide this for the rest of the tab" survives for `FinishSetupBanner.tsx` - the same
 * `sessionStorage`, try/catch-swallowed shape `pendingInviteCode.ts` already uses for a value that must
 * not outlive one browser tab. Keyed per site, the same reason `activeSiteStorage.ts` keys its own
 * stored fact per tenancy rather than storing one flat value: switching the active tenancy
 * (`switchTenancy`) must never carry tenant A's dismissal onto tenant B's still-unfinished setup.
 *
 * A plain function pair, not a hook - whether the banner is currently showing is `FinishSetupBanner`'s
 * own state; this module only reads and writes the one bit that has to survive a remount.
 */
const STORAGE_KEY_PREFIX = "ago-console:finish-setup-banner-dismissed:";

export function isFinishSetupBannerDismissed(siteId: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY_PREFIX + siteId) === "1";
  } catch {
    // Private-browsing/storage-disabled - the same fail-soft `pendingInviteCode.ts` already uses.
    // Losing this costs nothing worse than the banner reappearing after a dismissal, which is exactly
    // where every tenant already stood before this item.
    return false;
  }
}

export function dismissFinishSetupBanner(siteId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_PREFIX + siteId, "1");
  } catch {
    // Same fail-soft as `isFinishSetupBannerDismissed` - the caller's own component state still hides
    // the banner for the rest of this page's life either way.
  }
}
