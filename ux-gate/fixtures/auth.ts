import type { Page } from "@playwright/test";
import { fakeJwt } from "./fakeJwt.js";
import { OPERATOR_SUB } from "./data.js";

/**
 * `15-11`'s "authentication without a login form": writes a `User`-shaped record directly into
 * `window.sessionStorage`, in exactly the format `oidc-client-ts`'s `WebStorageStateStore` reads
 * (`ago-console/src/auth/userManager.ts` backs it with `sessionStorage`, not `localStorage`).
 *
 * Two things had to be verified against the installed package rather than assumed, because guessing
 * either wrong would make `AuthProvider.getUser()` silently return `null` and every screen would sit
 * on the `RequireAuth` spinner forever:
 *
 * - **The storage key.** `UserManager`'s private `_userStoreKey` getter
 *   (`node_modules/oidc-client-ts/dist/umd/oidc-client-ts.js`, `_userStoreKey`) returns
 *   `` `user:${authority}:${client_id}` ``, and `WebStorageStateStore` prefixes every key it writes
 *   with the literal `"oidc."` - so the full key is `` `oidc.user:${authority}:${client_id}` ``. Both
 *   `authority` and `client_id` have to be the exact strings this gate's own build was configured
 *   with (`ux-gate/README` / `.env.ux-gate` at the repo root), not the real deployment's.
 * - **The value's shape.** `User.toStorageString()` (same file) serialises exactly
 *   `{ id_token, session_state, access_token, refresh_token, token_type, scope, profile, expires_at }`
 *   - no more, no less. `PermissionsProvider`/`OperatorConnectionProvider` only ever read
 *   `user.access_token`, so `profile` carries the minimum a real Keycloak token would (`sub`, `email`)
 *   and nothing this gate's stubbed API responses would need to agree with.
 *
 * `expires_at` is set an hour out. `UserManager`'s `automaticSilentRenew` (on by default,
 * `userManager.ts`'s own doc comment) would otherwise try to renew this token against the real
 * authority once it saw it was near expiry - there is no such authority reachable from CI, and a gate
 * run finishes in well under an hour, so this never fires.
 */
export const UX_GATE_AUTHORITY = "http://127.0.0.1:4173/realms/ago-chat-ux-gate";
export const UX_GATE_CLIENT_ID = "ago-console-ux-gate";

function storageKey(): string {
  return `oidc.user:${UX_GATE_AUTHORITY}:${UX_GATE_CLIENT_ID}`;
}

export async function signInAsSeededOperator(page: Page): Promise<void> {
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  const accessToken = fakeJwt({ expiresAtMs, sub: OPERATOR_SUB });

  const storedUser = {
    id_token: undefined,
    session_state: null,
    access_token: accessToken,
    refresh_token: undefined,
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: OPERATOR_SUB,
      email: "ux-gate-operator@example.invalid",
    },
    expires_at: Math.floor(expiresAtMs / 1000),
  };

  // `addInitScript` re-runs before every document this `page` navigates to, which is what makes it
  // (rather than a one-shot `page.evaluate` after `goto`) safe here: the console reads this key from
  // its very first script tick (`AuthProvider`'s mount effect), before this gate's own test code
  // would get a chance to run `page.evaluate` post-navigation.
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      window.sessionStorage.setItem(key, value);
    },
    { key: storageKey(), value: JSON.stringify(storedUser) },
  );
}
