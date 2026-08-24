import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/userManager.js";
import { resolveOperatorState } from "../api/operatorsApi.js";
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
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(async (user) => {
        const state = await resolveOperatorState(user.access_token);
        void navigate(state === "operator" ? "/" : "/onboarding", { replace: true });
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
