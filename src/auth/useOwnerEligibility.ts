import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.js";
import { probeOwnerEligibility, type OwnerEligibility } from "../api/ownerApi.js";

/**
 * `12-03`: whether to draw the platform-owner navigation link, asked once per signed-in session.
 *
 * The answer comes from the server (`probeOwnerEligibility`, which has the full reasoning) - the
 * console never inspects the token's `realm_access.roles` and never decides for itself who the
 * platform owner is. `12-01`'s `RequirePlatformOwner` policy is the only thing that decides that,
 * on every single call, and this is that decision read back rather than reconstructed.
 *
 * Everything about this hook is UI-only, and it fails closed in every direction that is not an
 * explicit yes: the link is absent while the answer is in flight, absent on a refusal, and absent on
 * an error. Hiding a link is never a gate - the same caveat `OperatorShell` already restates for
 * `usePermissions()` - and the screen it leads to re-asks the same endpoint before rendering a
 * single row, so a wrong "eligible" here costs an ordinary "not authorized" state, not a leak.
 *
 * Mounted from `OperatorShell`, which is the layout route's element and therefore mounts once for
 * the whole session rather than once per page - so this is one extra request per sign-in, not one
 * per navigation.
 */
export function useOwnerEligibility(): OwnerEligibility {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [eligibility, setEligibility] = useState<OwnerEligibility>("unknown");

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time anything calling this renders - the
      // same "reaching here is a wiring bug" reasoning `PermissionsProvider` already states.
      return;
    }

    let cancelled = false;
    probeOwnerEligibility(accessToken)
      .then((result) => {
        if (!cancelled) {
          setEligibility(result);
        }
      })
      .catch((err: unknown) => {
        // Never fatal: an operator whose owner probe failed simply sees no owner link, which is the
        // correct outcome for all but one person on the platform anyway. Logged rather than
        // swallowed so a real wiring bug is still visible in dev tools - same rule
        // `PermissionsProvider` follows for its own fetch.
        console.error("Failed to probe platform-owner eligibility", err);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return eligibility;
}
