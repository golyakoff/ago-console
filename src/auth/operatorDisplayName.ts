import type { User } from "oidc-client-ts";

/**
 * Found live, 2026-08-27: the header showed `preferred_username` ("golyakoff"), the Keycloak login
 * name, not a name a colleague would recognise. `profile` scope is already requested
 * (`userManager.ts`), and Keycloak's default registration form requires a first and last name for
 * every account - seeded or self-registered - so `name` (the realm's own "full name" mapper,
 * `${firstName} ${lastName}`) is populated for every identity this console will ever show, not just
 * some. Falls back through the same chain the three call sites already had for an identity from a
 * provider that genuinely omits it.
 */
export function operatorDisplayName(user: User | null): string {
  return user?.profile.name ?? user?.profile.preferred_username ?? user?.profile.sub ?? "Signed in";
}
