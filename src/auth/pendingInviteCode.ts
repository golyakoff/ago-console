/**
 * `23-70`: carries an invite code across the one hop this console has no other way to carry anything
 * across - `RequireAuth`'s own `login()` redirect to Keycloak and back through `/callback`
 * (`RequireAuth.tsx`/`CallbackPage.tsx`, neither of which preserves a "return to" URL or query string
 * today; widening that routing is a bigger, riskier change than this item's own scope). `sessionStorage`
 * survives that round trip because it is scoped to the browser tab, not the page - the same mechanism
 * OAuth's own `state` parameter exists to solve, used here without inventing a second one, since
 * `InvitePreviewPage` and `RedeemInvitePage` are both this console's own pages and both already run in
 * the one tab that is about to leave for Keycloak and come back.
 *
 * <b>Consumed, not merely read.</b> `consumePendingInviteCode` clears the key the moment it is read -
 * a one-time credential-shaped value sitting in storage indefinitely is exactly the "must not linger"
 * discipline this item's own trap names for the code in the URL itself; storage is local to this
 * browser and never leaves it, but there is no reason to keep it around past the one read that uses
 * it.
 *
 * <b>Its own module, matching `activeSiteStorage.ts`'s own reason for being one</b> - a file mixing a
 * component export with plain function exports breaks Vite's Fast Refresh
 * (`react-refresh/only-export-components`), and neither page importing this needs the other's JSX.
 */
const PENDING_INVITE_CODE_STORAGE_KEY = "ago-console:pending-invite-code";

export function savePendingInviteCode(code: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_CODE_STORAGE_KEY, code);
  } catch {
    // Private-browsing/storage-disabled - the same fail-soft `activeSiteStorage.ts` already uses.
    // Losing this costs nothing worse than `RedeemInvitePage` starting with an empty field instead of
    // a prefilled one, which is exactly where it already stood before this item.
  }
}

export function consumePendingInviteCode(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_CODE_STORAGE_KEY);
    if (code !== null) {
      sessionStorage.removeItem(PENDING_INVITE_CODE_STORAGE_KEY);
    }
    return code;
  } catch {
    return null;
  }
}
