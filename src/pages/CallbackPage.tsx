import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/userManager.js";
import { resolveOperatorState } from "../api/operatorsApi.js";
import { probeOwnerEligibility } from "../api/ownerApi.js";
import { CenteredShell } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";

/**
 * Keycloak redirects here with `?code=...&state=...` after the operator signs in *or* registers -
 * `signinRedirectCallback()` exchanges the code for tokens (PKCE verified server-side against the
 * verifier `userManager`/`keycloakRegistrationRedirect` generated before the redirect) and fires
 * `userLoaded`, which `AuthProvider` is already listening for. The same handler serves both entry
 * points (`5-06`'s login and `10-03`'s `/signup`) because Keycloak's login and registration forms both
 * complete via the identical Authorization Code redirect back to this same `redirect_uri` -
 * `keycloakRegistrationRedirect`'s own doc comment has the detail on why no separate callback route
 * was needed.
 *
 * `10-03`: once a token comes back, this is where the three states the backlog names are actually
 * told apart:
 * - (a) an existing operator - `resolveOperatorState` returns `"operator"` -> queue, unchanged.
 * - (b) a real Keycloak identity with no `operators` row yet - `resolveOperatorState` returns
 *   `"keycloak-identity-only"` (a `403` from `GET /api/v1/operators/me`'s `RequireOperatorIdentity`
 *   policy, not a client-side JWT claims inspection - that function's own doc comment has the
 *   reasoning) -> `/onboarding`, new.
 * - (c) no token, or an invalid one - `signinRedirectCallback()` itself rejects before
 *   `resolveOperatorState` is ever called, landing in the existing `catch` below unchanged. An
 *   unexpected non-403 failure from `resolveOperatorState` (a network error, or a genuinely broken
 *   token Keycloak accepted but `Ago.Chat.Api`'s own audience/issuer check rejects) also falls into
 *   this same `catch` - there is no fourth state the backlog names for that case, and surfacing it as
 *   the existing "sign-in failed" message is the safer default over silently guessing a destination.
 *
 * `12-04`: **state (b) was two states wearing one answer.** `adr/0032` gives the platform owner no
 * `operators` row *on purpose*, so `GET /api/v1/operators/me` answers `403` for that identity too and
 * the split above sent the one person the `/owner` screen exists for to a form asking them to
 * register a shop. Worse than a wrong destination: `10-02`'s bootstrap would have made them an
 * operator of a tenant nothing in this product can remove. So:
 * - (d) the platform owner - a `403` from `operators/me` *and* an accepted call to `12-02`'s
 *   `GET /api/v1/owner/sites` -> `/owner`.
 *
 * Three things about how (d) is decided are deliberate:
 *
 * **It is asked second, not first.** (a) still wins outright. The two identities are orthogonal, not
 * ranked: holding Keycloak's `platform-owner` realm role says nothing about whether an `operators`
 * row exists, and on this deployment the author's own account has both - which is precisely why this
 * bug survived `12-03` unnoticed. An owner who is also an operator keeps landing in their queue, with
 * `OperatorShell`'s "Platform sites" link one click away, exactly as before.
 *
 * **It is the server's answer, not the token's.** `probeOwnerEligibility` is `12-03`'s existing probe
 * (`ownerApi.ts` has the full reasoning) - `12-01`'s `RequirePlatformOwner` policy decision, read
 * back. The console still never inspects `realm_access.roles`, and this adds no second mechanism: the
 * routing decision now uses the same probe `useOwnerEligibility` already made for the navigation link.
 *
 * **Its failure direction is `/onboarding`, not an error.** A probe that cannot answer leaves state
 * (b) exactly where it was before this item, which is the common case by an enormous margin. The
 * cost of being wrong that way is a form the server now refuses (`AuthorizationPolicies.
 * NotThePlatformOwner`) and a page that says why (`OnboardingPage`) - not a committed row.
 */
/**
 * `12-04`: the second question, asked only once `GET /api/v1/operators/me` has already answered "no
 * operator row" - which, since `adr/0032`, is a state two different people are in.
 *
 * The probe's own refusal (`"ineligible"`) and its inability to answer (`"unknown"` - a 500, and, via
 * the `catch`, a network failure) both mean `/onboarding`, and they mean it for different reasons
 * worth separating: a refusal is the server positively saying "not the owner", while an unanswerable
 * probe is no evidence at all. They coincide here because `/onboarding` is where a token that is not
 * the owner's belongs *and* because it is where this state went before this item existed, so an
 * outage cannot change anybody's destination. It is the server-side refusal on the bootstrap
 * endpoint, not this function, that makes the second case safe.
 */
async function destinationWithoutAnOperatorRow(accessToken: string): Promise<string> {
  try {
    return (await probeOwnerEligibility(accessToken)) === "eligible" ? "/owner" : "/onboarding";
  } catch {
    return "/onboarding";
  }
}

export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(async (user) => {
        const state = await resolveOperatorState(user.access_token);
        if (state === "operator") {
          void navigate("/", { replace: true });
          return;
        }

        void navigate(await destinationWithoutAnOperatorRow(user.access_token), { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unknown error."));
  }, [navigate]);

  if (error) {
    // `11-05`: this was a plain `<p>` with no `role` at all, which meant a screen-reader user who
    // had navigated away from the top of the page was never told the sign-in had failed. `Alert
    // tone="danger"` carries `role="alert"`, so it is announced. That is an accessibility fix, not a
    // behaviour change - the same text, at the same moment, for the same reason.
    return (
      <CenteredShell>
        <Alert tone="danger" title="Sign-in failed">
          {error}
        </Alert>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell>
      <Spinner label="Completing sign-in…" />
    </CenteredShell>
  );
}
