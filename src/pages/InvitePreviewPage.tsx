import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { previewOperatorInvite, type OperatorInvitePreviewResponse } from "../api/operatorInvitesApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { savePendingInviteCode } from "../auth/pendingInviteCode.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { AppShell, PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";

/**
 * `23-70`: the link half of "an invitation is something you can send somebody"
 * (`docs/backlog/23-70-*.md`) - `/team/people`'s own invite dialog now hands out a URL to this route
 * rather than a bare `invite_2Zv…` code shown with no destination. Public, mounted outside every
 * provider exactly like `PolicyPage`/`RedeemInvitePage` - the same reasoning applies verbatim: "a
 * stranger opening a link they were sent" has no account yet, so there is nothing here for
 * `RequireAuth` to gate, and this page must not assume one exists.
 *
 * <b>What it shows, and why nothing more.</b> `POST /api/v1/operator-invites/preview`
 * (`AllowAnonymous()`, `Ago.Chat.Api.OperatorInvites.OperatorInviteEndpoints`) answers exactly the
 * three facts this item's own backlog text names - "which shop, from whom, and that it expires" -
 * and nothing else: no operator list, no plan, no role name. That is not this page under-building; it
 * is the server refusing to leak anything about the tenant beyond what a person being invited needs to
 * see (this item's own trap), so there is nothing wider for this component to render even if it
 * wanted to.
 *
 * <b>Three states from one `200`, never a bare error status.</b> `preview.status` is one of
 * `"Valid"`/`"Expired"`/`"Redeemed"` - this item's own trap again: "an expired or already-used
 * invitation must say so plainly, not 404 and not throw." Only a code matching no invite at all
 * (`OperatorInvite.NotFound`, a real `404`) is treated as this page's own `error` state, worded
 * identically to `redeemInviteErrorNotFound` for the same underlying server fact on the redemption
 * side of this exact code.
 *
 * <b>"Continue" does not sign anybody in itself.</b> `/redeem-invite` is `RequireAuth`-gated
 * (`App.tsx`), so navigating there triggers Keycloak's own sign-in redirect for a reader with no
 * session - a full-page round trip this console's `RequireAuth`/`CallbackPage` have no mechanism to
 * carry a return URL or query string through today (widening that is a bigger change than this item's
 * scope). `savePendingInviteCode` (`pendingInviteCode.ts`) is what survives that round trip instead:
 * `RedeemInvitePage` reads it back once it (eventually) mounts - whether reached directly, because the
 * reader was already signed in, or by way of `/onboarding`'s own existing link back to
 * `/redeem-invite` for a freshly-authenticated identity with no operator row yet.
 */
export function InvitePreviewPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; preview: OperatorInvitePreviewResponse }
    | { status: "error"; message: string }
  >(code ? { status: "loading" } : { status: "error", message: strings.invitePreviewNotFoundMessage });

  useEffect(() => {
    if (!code) {
      return;
    }

    let cancelled = false;
    previewOperatorInvite(code)
      .then((preview) => {
        if (!cancelled) {
          setState({ status: "ready", preview });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const message =
          err instanceof ApiProblemError && err.code === "OperatorInvite.NotFound"
            ? strings.invitePreviewNotFoundMessage
            : strings.invitePreviewErrorGeneric;
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [code, strings]);

  const handleContinue = () => {
    if (!code) {
      return;
    }
    savePendingInviteCode(code);
    void navigate("/redeem-invite");
  };

  const expiresAt = state.status === "ready" ? parseInstant(state.preview.expiresAt) : null;

  return (
    <AppShell>
      <PageHead title={strings.invitePreviewTitle} />

      <Panel>
        {state.status === "loading" && <Spinner label={strings.invitePreviewLoading} />}

        {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}

        {state.status === "ready" && state.preview.status === "Expired" && (
          <Alert tone="danger">{strings.invitePreviewExpiredMessage}</Alert>
        )}

        {state.status === "ready" && state.preview.status === "Redeemed" && (
          <Alert tone="info">{strings.invitePreviewRedeemedMessage}</Alert>
        )}

        {state.status === "ready" && state.preview.status === "Valid" && (
          <div className="ago-stack">
            <p>
              {strings.invitePreviewSiteLabel} <strong>{state.preview.siteName}</strong>
            </p>
            {state.preview.invitedByDisplayName && (
              <p>
                {strings.invitePreviewInvitedByLabel} {state.preview.invitedByDisplayName}
              </p>
            )}
            {expiresAt && (
              <p>
                {strings.invitePreviewExpiresLabel} {formatDateStamp(expiresAt, timeZone, strings)}
              </p>
            )}
            <div className="ago-row">
              <Button variant="primary" onClick={handleContinue}>
                {strings.invitePreviewContinueButton}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
