import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { redeemOperatorInvite } from "../api/operatorInvitesApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { useStrings } from "../i18n/StringsContext.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";

/**
 * `23-27`: the missing other end of `13-01`'s invite. `CreateOperatorInvite` (the tenant-facing
 * screen `23-22` shipped) hands out a code; nothing before this item let anybody spend one -
 * `ago-console` had no screen, no route and no API call for `POST /api/v1/operator-invites/redeem`
 * at all (the backlog item's own "verified" section: the only occurrence of the word "invite" in this
 * repository's source was an unrelated comment in `SignupPage.tsx`).
 *
 * <b>Where this fits, and why it is not inside the operator layout.</b> Mounted behind `RequireAuth`
 * *alone* (`App.tsx`), exactly like `OnboardingPage` - `PermissionsProvider`/`OperatorConnectionProvider`
 * both assume `OperatorId`/`SiteId` claims a caller redeeming a code does not carry yet
 * (`OperatorIdentityClaimsTransformation`'s own remarks: a Keycloak token that resolves to no
 * `operators` row adds neither claim). `ago-chat`'s own route mirrors this exactly - `RequireKeycloakIdentity`,
 * never `RequireOperatorIdentity`, for the identical reason (`OperatorInviteEndpoints`'s own doc
 * comment). The alternative - gating this route the same way `/admin`/`/settings/*` do, on a
 * permission checked after mounting - would not work at all: those pages assume an `operators` row
 * already exists to hold the permission being checked, which is precisely the thing this screen's
 * caller does not have yet.
 *
 * <b>Reachability - the actual defect this item closes.</b> `CallbackPage` routes every Keycloak
 * identity with no `operators` row to `/onboarding` unconditionally (state (b), its own doc comment) -
 * there was, and remains, no branch for "this identity was invited, not signing up cold." Rather than
 * widen that routing decision (out of this item's scope, and a larger, riskier change for a login
 * path every identity passes through), `OnboardingPage` gained one link to here and this page links
 * back - the same two-way pointer `OnboardingPage` itself already has to `/owner` for the platform
 * owner's case. A person handed a code signs in as usual, lands on `/onboarding` the way every fresh
 * identity does today, and follows the link instead of filling in the form. `OnboardingPage.tsx`
 * itself is otherwise unchanged by this item - the single link is the entire surface touched there.
 *
 * <b>The four (in practice five) outcomes, matched to `RedeemOperatorInviteHandler`'s own
 * `OperatorInviteRedemptionResult` cases.</b> The backlog names four - wrong code, already used,
 * expired, happy path - but the handler actually distinguishes five failure shapes plus success
 * (`ConversationErrors`'s own five `OperatorInvite.*` codes: `NotFound`, `Expired`, `AlreadyRedeemed`,
 * `AlreadyOperatorOnSite`, `SeatLimitReached`). Collapsing the last two into "already used" would be
 * exactly the failure the backlog warns against - `AlreadyOperatorOnSite` is not a used-up code at
 * all (the code might still be perfectly redeemable by somebody else) and `SeatLimitReached` is a
 * billing fact about the site, not anything wrong with the code - so this screen keeps all five
 * distinct, branching on `ApiProblemError#code` (`api-design.md`: "clients branch on `type`, never on
 * the message"), never on the server's prose.
 *
 * <b>Where the newly-granted operator lands, and why the redirect waits.</b> `navigate("/", { replace:
 * true })` fires only after `redeemOperatorInvite` has resolved successfully, using the *same* access
 * token this page already held - no new Keycloak round trip, the identical reasoning
 * `OnboardingPage.tsx`'s own doc comment gives for `registerSite`: `OperatorIdentityClaimsTransformation`
 * resolves `sub` against `operators` fresh on every request rather than baking the result into the
 * JWT, so the moment this call commits the new row, that same token starts passing
 * `RequireOperatorIdentity` on the very next call. Navigating to `/` mounts `PermissionsProvider`
 * fresh, which fetches `GET /api/v1/me/tenancies` and `GET /api/v1/operators/me` for the first time
 * with the *new* identity already in place - so the queue's own navigation reflects the just-granted
 * permissions without anybody reloading by hand. The alternative - navigating immediately and letting
 * the destination route re-fetch - is exactly what this does; there is no separate "refresh
 * permissions" step to add, because none of the state this depends on is cached anywhere client-side
 * to begin with (`PermissionsProvider`'s own one-fetch-per-mount shape). The one-second delay before
 * the navigation fires exists only so the success message below is a message a person can actually
 * read, not a flash between two renders - `interact`/`flush` in this page's own tests advance past it
 * explicitly rather than asserting on a redirect that raced the paint.
 *
 * <b>Why this page's own strings render in English regardless of the target site's language, and why
 * that is not silently accepted.</b> `useStrings()` is used throughout (unlike `OnboardingPage`,
 * `SignupPage`, `CallbackPage`, which hardcode English literals directly) - the backlog item's own
 * Scope is explicit: "Every string through the translation files, in every locale the console
 * ships." Both `en.ts` and `ru.ts` carry a real translation for every key below. What this cannot
 * do, without a backend change this item's own Out of scope forbids, is *choose* the Russian one at
 * the right moment: this screen has no site to read a `locale` from until *after* redemption
 * succeeds, and `RedeemOperatorInviteResponse` carries only `operatorId`/`siteId`, no `locale`
 * (`OperatorInviteEndpoints.cs`'s own contract) - unlike `operators/me`'s response, which is exactly
 * where `PermissionsProvider` reads the tenant's locale from once an identity resolves to one.
 * `StringsContext.tsx`'s own doc comment records that `/onboarding`/`/signup`/`/callback` are in the
 * identical position ("there is no tenant whose language those pages could follow") and renders
 * `useStrings()`'s built-in English default rather than inventing a client-side signal (a browser
 * locale, a query parameter) that would be the only mechanism of its kind in this codebase, and would
 * still be a guess this project has no way to confirm is what the *inviting site* actually uses. So:
 * `ux-gate/gate.spec.ts` exempts this screen from its "no untranslated interface text" assertion by
 * name, next to `owner-sites`, for a related but distinct reason spelled out where that exemption
 * lives - `/owner`'s English is permanent by design; this screen's is a consequence of not yet having
 * a locale signal, the same category `/onboarding` has always been in, now made real rather than
 * skipped by the backlog item's own explicit ask for a translated string table.
 */
export function RedeemInvitePage() {
  const { user, logout } = useAuth();
  const strings = useStrings();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleared on unmount, the same "a pending timer must not fire against an unmounted page" discipline
  // `WorkspaceLayout.tsx`'s own announcement-lifetime timer already follows.
  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // The same "the disabled button is a presentation of the rule, not the rule" reasoning
    // `OnboardingPage.tsx` states for its own single-field form - Enter still submits, and a second
    // submit mid-flight must not fire a second request.
    if (submitting || redeemed) {
      return;
    }

    setSubmitError(null);

    const trimmed = code.trim();
    if (trimmed.length === 0) {
      setValidationError(strings.redeemInviteValidationEmpty);
      return;
    }
    setValidationError(null);

    const accessToken = user?.access_token;
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in Keycloak session by the time this page renders - the
      // same "reaching here is a wiring bug" reasoning `OnboardingPage.tsx`/`PermissionsProvider`
      // already state for their own equivalent check.
      return;
    }

    setSubmitting(true);
    try {
      await redeemOperatorInvite(accessToken, { code: trimmed });
      setRedeemed(true);
      // See this component's own doc comment for why this waits rather than navigating immediately.
      redirectTimer.current = setTimeout(() => {
        void navigate("/", { replace: true });
      }, 1000);
    } catch (err) {
      setSubmitError(messageFor(err, strings));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      identity={
        <ShellIdentity
          operator={operatorDisplayName(user)}
          // No site yet - the entire reason this page exists, same as `OnboardingPage`.
          siteId={null}
          onSignOut={() => void logout()}
        />
      }
    >
      <PageHead title={strings.redeemInviteTitle} description={strings.redeemInviteDescription} />

      <Panel>
        {redeemed ? (
          <Alert tone="success">{strings.redeemInviteSuccessMessage}</Alert>
        ) : (
          <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
            <Field label={strings.redeemInviteCodeLabel} error={validationError}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={submitting}
                  autoComplete="off"
                />
              )}
            </Field>

            {submitError && <Alert tone="danger">{submitError}</Alert>}

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? strings.redeemInviteSubmitting : strings.redeemInviteSubmit}
              </Button>
            </div>
          </form>
        )}
      </Panel>

      {!redeemed && (
        // Deliberately not `.ago-row` (`index.css`: `display: flex`) - a flex parent blockifies its
        // anchor child (CSS's own "blockification" rule, `ux-gate/lib/minSize.ts`'s own doc comment
        // has the detail, found live against `.ago-workspace__back`), which turns an ordinary,
        // sentence-sized hyperlink into something the gate correctly measures as a 22px-tall tap
        // target and fails. A plain `<p>` keeps the link's own default `display: inline`, matching
        // WCAG 2.5.8's own exception for "the target is in a sentence or block of text" - this is not
        // a button-style row, it is one sentence.
        <p>
          <Link to="/onboarding">{strings.redeemInviteSetupOwnSiteLink}</Link>
        </p>
      )}
    </AppShell>
  );
}

/**
 * `ConversationErrors`'s own five `OperatorInvite.*` codes (`ago-chat`), matched one-for-one so the
 * screen never collapses two server-distinguished outcomes into one sentence - this function's own
 * doc comment on the component above has the full reasoning for why all five, not the backlog's own
 * headline four, are kept apart. Anything else - a network failure the fetch itself threw, or a
 * status this screen does not otherwise recognise - falls through to the generic message, the same
 * "say something usable" floor `OnboardingPage.tsx`'s own catch block already sets.
 */
function messageFor(err: unknown, strings: ReturnType<typeof useStrings>): string {
  if (err instanceof ApiProblemError) {
    switch (err.code) {
      case "OperatorInvite.NotFound":
        return strings.redeemInviteErrorNotFound;
      case "OperatorInvite.Expired":
        return strings.redeemInviteErrorExpired;
      case "OperatorInvite.AlreadyRedeemed":
        return strings.redeemInviteErrorAlreadyRedeemed;
      case "OperatorInvite.AlreadyOperatorOnSite":
        return strings.redeemInviteErrorAlreadyOperator;
      case "OperatorInvite.SeatLimitReached":
        return strings.redeemInviteErrorSeatLimitReached;
      default:
        return strings.redeemInviteErrorGeneric;
    }
  }

  return strings.redeemInviteErrorGeneric;
}
