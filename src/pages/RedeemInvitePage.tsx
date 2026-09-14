import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { consumePendingInviteCode } from "../auth/pendingInviteCode.js";
import { redeemOperatorInvite, redeemPendingOperatorInviteForMe } from "../api/operatorInvitesApi.js";
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
 * <b>The four (in practice seven) outcomes, matched to `RedeemOperatorInviteHandler`'s own
 * `OperatorInviteRedemptionResult` cases.</b> The backlog names four - wrong code, already used,
 * expired, happy path - but the handler actually distinguishes seven failure shapes plus success
 * (`ConversationErrors`'s own seven `OperatorInvite.*` codes: `NotFound`, `Expired`, `AlreadyRedeemed`,
 * `AlreadyOperatorOnSite`, `SeatLimitReached`, and - `25-73` - `Revoked`/`EmailMismatch`). Collapsing
 * the last two of the original five into "already used" would be exactly the failure the backlog
 * warns against - `AlreadyOperatorOnSite` is not a used-up code at
 * all (the code might still be perfectly redeemable by somebody else) and `SeatLimitReached` is a
 * billing fact about the site, not anything wrong with the code - so this screen keeps all seven
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
 * <b>Why this page rendered in English regardless of the target site's language, and why that
 * stopped being accepted.</b> `useStrings()` was used throughout from the start (unlike
 * `OnboardingPage`, `SignupPage`, `CallbackPage` at the time, which hardcoded English literals
 * directly) - the backlog item's own Scope was explicit: "Every string through the translation
 * files, in every locale the console ships." Both `en.ts` and `ru.ts` carried a real translation for
 * every key below from day one. What this page could not do, without a backend change this item's
 * own Out of scope forbade, was *choose* the Russian one at the right moment: this screen has no site
 * to read a `locale` from until *after* redemption succeeds, and `RedeemOperatorInviteResponse`
 * carries only `operatorId`/`siteId`, no `locale` (`OperatorInviteEndpoints.cs`'s own contract) -
 * unlike `operators/me`'s response, which is exactly where `PermissionsProvider` reads the tenant's
 * locale from once an identity resolves to one. So this screen rendered `useStrings()`'s bare English
 * default, and `ux-gate/gate.spec.ts` exempted it from the "no untranslated interface text" assertion
 * by name, next to `owner-sites`, while it did.
 *
 * `23-28` removes that premise rather than solving the puzzle it posed. `StringsContext.tsx`'s own
 * doc comment has the full account: the site is not the only thing that can decide a locale, and
 * where nothing is set, the answer is Russian, not a guess and not English. This page needed no
 * change of its own to benefit - it already called `useStrings()` for every string, so wrapping this
 * route (and `/onboarding`, `/signup`, `/callback`) in `App.tsx`'s `PreSessionStringsProvider` is the
 * entire fix, and the `ux-gate` exemption named above is gone along with it - this screen is no
 * longer in the position `/owner`'s permanent English is.
 *
 * `23-70`: the code field is now prefilled, not only typeable. `/team/people`'s own invite dialog
 * hands out a URL (`/invite/{code}`) rather than a bare code, and its own landing page
 * (`InvitePreviewPage`) stores that code for this page to pick up before sending a reader on through
 * `RequireAuth`'s sign-in redirect - see this component's own `code` state initializer and
 * `pendingInviteCode.ts` for why sessionStorage is what survives that round trip. Manual entry still
 * works exactly as before for anyone who arrives here directly with a code in hand.
 *
 * `25-85`: a third arrival shape, with no code anywhere - `OnboardingPage`'s own "activate it here"
 * card links here bare, because `HasPendingOperatorInviteHandler` never had a code to hand it in the
 * first place (`OperatorInvite.CodeHash` is a one-way hash, not a deliberately-withheld value this
 * item could simply widen a query to return - see this item's own worker report). This page now
 * redeems that case directly, by the caller's own authenticated email instead of a code, on mount -
 * see `attemptAutoRedeemForMe`'s own doc comment for the security reasoning and the honest fallback
 * when nothing unambiguous is found.
 */
export function RedeemInvitePage() {
  const { user, logout } = useAuth();
  const strings = useStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `25-73`: `?code=` on this page's own URL - Keycloak's `execute-actions-email` redirect_uri carries
  // the invite code this way (`redirect_uri=.../callback?inviteCode=...`, forwarded on by
  // `CallbackPage`'s own redirect to `/redeem-invite?code=...`), because the sessionStorage
  // `consumePendingInviteCode()` right below relies on cannot survive being the very first thing this
  // browser ever loads from this console - which is exactly the case for someone who opened the email
  // link on a device or browser that never visited `/invite/{code}` first. Read once, on this page's
  // very first render, the same lazy-initializer shape `consumePendingInviteCode()` already uses for
  // the identical "read exactly once" reason.
  const [codeFromUrl] = useState(() => searchParams.get("code"));
  // `23-70`: prefilled from `/invite/:code`'s own "Continue" button when this page is reached that
  // way - `consumePendingInviteCode`'s own doc comment has the full reasoning for why sessionStorage,
  // not a route param, is what survives the sign-in redirect this route sits behind. The lazy
  // initializer form (not a bare `useState("")` plus an effect) reads it exactly once, on this page's
  // very first render - `consumePendingInviteCode` already clears the key as it reads it, so a second
  // read (a remount, a second tab) correctly finds nothing rather than replaying a stale value.
  // `25-73`: `codeFromUrl` wins when both are present - an email-link arrival is never also a
  // sessionStorage-carried one (they are two different entry points into this same page), but if it
  // somehow were, the URL's own value is the one this exact page load was actually opened with.
  const [code, setCode] = useState(() => codeFromUrl ?? consumePendingInviteCode() ?? "");
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

  // `25-73`: pulled out of `handleSubmit` below so an arrival via `?code=` (the email link) can drive
  // the identical redemption path automatically, without inventing a second, parallel implementation
  // that could drift from the one the manual form already uses.
  const submitCode = async (candidate: string) => {
    if (submitting || redeemed) {
      return;
    }

    setSubmitError(null);

    const trimmed = candidate.trim();
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitCode(code);
  };

  /**
   * `25-85`: `OnboardingPage`'s own "activate it here" card links to this page bare, with no code at
   * all - `HasPendingOperatorInviteHandler`'s own deliberately-narrow design (`25-73`) never gave that
   * page a code to carry, and widening it to *return* one (the backlog's own literal suggestion) turned
   * out to be impossible: `OperatorInvite.CodeHash` is a one-way SHA-256, so no code is recoverable from
   * storage for any caller, authenticated or not - see this item's own worker report for the full
   * account. Rather than show an empty required field and make the reader go find the code by hand
   * (this item's own real bug), this page redeems directly - keyed by the caller's own authenticated
   * token email, not a code - for an authenticated caller whose email matches a pending invite.
   * `RedeemPendingOperatorInviteForCallerHandler`'s own remarks (`ago-chat`) carry the full security
   * reasoning for why that is not a weaker check: the same trust level `CallbackPage`'s own already-
   * shipped `?inviteCode=` auto-redemption already grants, to a second path that currently grants less.
   *
   * Falls open to the ordinary manual form (already what renders below) on
   * `OperatorInvite.NoAutoRedeemablePendingInvite` - nothing this call could find to redeem
   * automatically, not this caller's own mistake, so no error toast for it - the same "an unanswerable
   * probe must not block, only fail to help" shape `OnboardingPage.tsx`'s own `hasPendingInvite` probe
   * already follows for the identical kind of "could not tell" outcome.
   */
  const attemptAutoRedeemForMe = async (accessToken: string) => {
    if (submitting || redeemed) {
      return;
    }

    setSubmitting(true);
    try {
      await redeemPendingOperatorInviteForMe(accessToken);
      setRedeemed(true);
      // See this component's own doc comment for why this waits rather than navigating immediately.
      redirectTimer.current = setTimeout(() => {
        void navigate("/", { replace: true });
      }, 1000);
    } catch (err) {
      if (err instanceof ApiProblemError && err.code === "OperatorInvite.NoAutoRedeemablePendingInvite") {
        return;
      }
      setSubmitError(messageFor(err, strings));
    } finally {
      setSubmitting(false);
    }
  };

  // `25-73`'s own Done-when: "the invited user's flow never surfaces the create-your-own-company
  // form... no branch point where a new tenant could be created instead." An invitee who followed the
  // email link has no reason to know what a "code" is or to click a second button to spend one - so
  // when the code arrived via `?code=` (as opposed to being manually typed, or prefilled from `/invite/
  // :code` and confirmed with a deliberate click), redemption fires automatically, once, on mount.
  useEffect(() => {
    if (!codeFromUrl) {
      return;
    }
    // `queueMicrotask`, not a bare call: `submitCode`'s own first statement is a synchronous
    // `setSubmitError(null)`, and React's own eslint rule (react-hooks/set-state-in-effect) refuses a
    // state update that synchronous within an effect body, on the "cascading renders" grounds its own
    // message states - deferring by one microtask is the same fix that rule's own documentation
    // recommends for "the effect's real job is triggering an external action, not computing state
    // itself."
    queueMicrotask(() => {
      void submitCode(codeFromUrl);
    });
    // Fire once, on mount, for the code this page was opened with; submitCode's own identity changes
    // every render (it closes over `code`/`submitting`/`redeemed`), and re-running this effect on
    // every one of those changes would either resubmit or do nothing depending on timing - neither is
    // the "once" this effect exists to be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `25-85`: the third, remaining arrival shape at this page - no code at all, neither `?code=` (the
  // email-link effect above already owns that) nor a `/invite/:code`-prefilled one (which still needs
  // the deliberate click `23-70` established, so `code` being non-empty here also skips it). `code`
  // is read from this effect's own mount-time closure (empty deps, the identical shape the effect
  // above already uses) - a value the user might type afterward must never retroactively suppress or
  // trigger this, since it only ever reflects what this page was actually opened with.
  useEffect(() => {
    if (code) {
      return;
    }

    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    // `queueMicrotask` - the identical `react-hooks/set-state-in-effect` reasoning the effect above
    // already gives for its own `submitCode` call.
    queueMicrotask(() => {
      void attemptAutoRedeemForMe(accessToken);
    });
    // Fire once, on mount - the identical "the function's own identity changes every render" reasoning
    // the effect above already gives for its own empty deps array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <form className="ago-stack" onSubmit={handleSubmit}>
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
 * `ConversationErrors`'s own seven `OperatorInvite.*` codes (`ago-chat`), matched one-for-one so the
 * screen never collapses two server-distinguished outcomes into one sentence - this function's own
 * doc comment on the component above has the full reasoning for why all seven, not the backlog's own
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
      // `25-73`: revoked before acceptance - this item's own Done-when, and its own stated wording.
      case "OperatorInvite.Revoked":
        return strings.redeemInviteErrorRevoked;
      // `25-73`'s own real security boundary: the code is real, but this signed-in identity's own
      // email does not match the address the invite was sent to.
      case "OperatorInvite.EmailMismatch":
        return strings.redeemInviteErrorEmailMismatch;
      default:
        return strings.redeemInviteErrorGeneric;
    }
  }

  return strings.redeemInviteErrorGeneric;
}
