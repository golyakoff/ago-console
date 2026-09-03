import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/userManager.js";
import { isReplayedCallback } from "../auth/replayedCallback.js";
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
 *   `resolveOperatorState` is ever called, landing in the existing `catch` below unchanged.
 *
 * `11-17`: **a non-403 failure from `resolveOperatorState` is no longer folded into (c).** Before
 * this item it was - the old comment here called that "the safer default over silently guessing a
 * destination", which was true about *where to navigate* (nowhere, still true) but wrong about *what
 * to say*: sign-in had already succeeded by the time this call runs, Keycloak's own round trip is
 * over, so telling the operator "Sign-in failed" sends them to check Keycloak credentials for a
 * problem that is not there. Found for real on 2026-09-03 (`ago-root#383`): a CORS-refused
 * `GET /api/v1/operators/me` after a successful login rendered "Sign-in failed / Failed to fetch",
 * and the person diagnosing it went looking at the wrong end of the system. This call's own failure
 * now renders as a distinct message that names the endpoint - see the `.catch` on
 * `resolveOperatorState` below, not the outer one.
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
 * (b) exactly where it was before this item, which is the common case by an enormous margin.
 *
 * `12-05`: that last paragraph used to end "the cost of being wrong that way is a form the server now
 * refuses". The server no longer refuses it - `adr/0063`'s "Reversed in 12-05" - so the cost is now a
 * usable registration form shown to a platform owner who did not ask for one. That is a smaller cost
 * than it sounds and the reason this item could relax the refusal at all: the form takes a site name
 * and an embed origin and a deliberate press of "Finish setup", which is not something anybody does
 * by accident, and `OnboardingPage` names the consequence in the owner's case before they do.
 *
 * **Nothing else about (d) changed.** In particular the precedence is untouched: an owner who is
 * *also* an operator still lands in their queue, with "Platform sites" one click away - which is now
 * a state a person can actually reach by registering a site, rather than only by the realm being
 * hand-edited.
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

/** The two ways `CallbackPage` can end in a red `Alert` - kept as one shape so the component below has
 * one rendering branch, not two, but with `kind` on it so a screen-reader user and a sighted one are
 * told the same distinction: `"sign-in"` is Keycloak's own round trip failing (unchanged text, unchanged
 * meaning); `"operator-lookup"` is `11-17`'s new case - sign-in already succeeded, the call *after* it
 * did not. */
interface CallbackFailure {
  readonly kind: "sign-in" | "operator-lookup";
  readonly title: string;
  readonly detail: string;
}

export function CallbackPage() {
  const navigate = useNavigate();
  const [failure, setFailure] = useState<CallbackFailure | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(async (user) => {
        // `11-17`: this call's own failure is deliberately caught here, not by the outer `.catch`
        // below - by the time it runs, `signinRedirectCallback()` has already succeeded, so whatever
        // goes wrong here (unreachable API, a CORS refusal, an unexpected non-403 status) is a
        // different problem with a different fix than a failed sign-in, and `ago-root#383` is the
        // record of what it costs to tell them apart from the message alone: the API is named
        // directly, so the next person reading this does not have to go looking for it.
        let state: Awaited<ReturnType<typeof resolveOperatorState>>;
        try {
          state = await resolveOperatorState(user.access_token);
        } catch (err: unknown) {
          setFailure({
            kind: "operator-lookup",
            title: "Signed in, but couldn't load your account",
            detail:
              `GET /api/v1/operators/me failed: ${err instanceof Error ? err.message : "Unknown error."} ` +
              "Reload this page to try again. If it keeps happening, the API is unreachable or this " +
              "origin has not been allowed to call it yet - this is not a problem with your Keycloak sign-in.",
          });
          return;
        }

        if (state === "operator") {
          void navigate("/", { replace: true });
          return;
        }

        void navigate(await destinationWithoutAnOperatorRow(user.access_token), { replace: true });
      })
      .catch((err: unknown) => {
        if (isReplayedCallback(err)) {
          // `11-17`: not an error at all in the ordinary case - see `isReplayedCallback`'s own doc
          // comment. `RequireAuth` on `/` already redirects to Keycloak the instant it sees no
          // session, which is exactly "send the operator back to sign in" without this component
          // driving `userManager` a second time itself.
          void navigate("/", { replace: true });
          return;
        }

        setFailure({
          kind: "sign-in",
          title: "Sign-in failed",
          detail: err instanceof Error ? err.message : "Unknown error.",
        });
      });
  }, [navigate]);

  if (failure) {
    // `11-05`: this was a plain `<p>` with no `role` at all, which meant a screen-reader user who
    // had navigated away from the top of the page was never told the sign-in had failed. `Alert
    // tone="danger"` carries `role="alert"`, so it is announced. That is an accessibility fix, not a
    // behaviour change - the same text, at the same moment, for the same reason, and `11-17` keeps it
    // for both failure kinds above rather than only the original one.
    return (
      <CenteredShell>
        <Alert tone="danger" title={failure.title}>
          {failure.detail}
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
