import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { eraseSite } from "../api/sitesApi.js";
import { checkOperatorErasure } from "../api/operatorsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { usePollUntilErased } from "../erasure/usePollUntilErased.js";
import type { ErasureCheckOutcome } from "../erasure/erasureCheck.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** `16-02`'s dedicated permission - deliberately not `site:configure`, which every other tenant
 * self-service screen in this shell (`WidgetConfigPage`, `OfflineAutoReplyPage`, `AdminConversationsPage`)
 * is gated on. The backlog item raises this exact question in its own Scope ("decide whether this
 * needs a new permission or the existing `site:configure` is too broad for it") and answers it: "a
 * single boolean that destroys a business is a plausible case for its own [permission]." Named once
 * here, colocated with the one component that checks it, on `CloseConversationButton.CLOSE_PERMISSION`'s
 * exact precedent - no shared constants file exists between this repository and `ago-chat`. */
export const SITE_ERASE_PERMISSION = "site:erase";

/** Same informal "2-3s, no measurement required" cadence `EraseConversationButton`'s own poll uses -
 * see that file's doc comment for the reasoning (an operator who just confirmed a destructive action
 * is actively watching, unlike a background presence check). */
const ACCOUNT_ERASURE_POLL_INTERVAL_MS = 3_000;

/**
 * `16-02`: `/settings/delete-account` - the tenant's own whole-account deletion, reachable from the
 * same settings area `WidgetConfigPage`/`OfflineAutoReplyPage` already occupy
 * (`consoleNav.ts`'s own `site:erase` gate), but never sharing their `site:configure` gate: an
 * operator who may reconfigure the widget must not, by that alone, be able to destroy the account.
 *
 * ## The confirmation
 *
 * Modeled on `CloseConversationButton`'s own native `<dialog>` confirmation (`adr/0030`) - the same
 * "one destructive click behind one real confirmation, no bespoke modal framework" this codebase
 * already established, applied to a page-level action instead of a row action for the first time.
 *
 * ## Why this page cannot behave like every other settings screen once confirmed
 *
 * `WidgetConfigPage`/`OfflineAutoReplyPage` both finish on their own `PUT`'s response: the server's
 * `200` *is* the new state. `eraseSite`'s `202 Accepted` is not - it only means a `Ago.Chat.Worker`
 * job has started (`16-02`'s own Scope: "these touch many rows across several stores... they belong
 * in Ago.Chat.Worker... not in a synchronous HTTP call"), and this item's own Done-when is explicit
 * that "the console must not claim it is done before it is." So a third, terminal state exists beyond
 * "form" and "submitting": **erasing**, which replaces the whole panel (there is nothing left on this
 * page to interact with - the account whose settings this screen would otherwise let you change is
 * being deleted) and starts `usePollUntilErased` against `checkOperatorErasure`
 * (`operatorsApi.ts` - see that function's own doc comment for the "the exact 'gone' signal was not
 * settled with the parallel `ago-chat` side" caveat).
 *
 * ## Signing out
 *
 * Once the poll actually observes completion, `logout()` is the correct action rather than a bespoke
 * "you have been deleted" screen: the signed-in identity's own `operators` row is gone, so there is no
 * session left for this console to represent, and `AuthProvider.logout` already does the one thing
 * that is true regardless - `userManager.signoutRedirect()`, a full-page redirect through Keycloak's
 * own sign-out that leaves this console in the same logged-out state `RequireAuth` sends anyone with
 * no session to. No new "session died" handler was needed or added; this is the existing one, reused.
 */
export function AccountDeletionPage() {
  const { user, logout } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  const checkErased = useCallback((): Promise<ErasureCheckOutcome> => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in session by the time this page renders - same
      // "reaching here is a wiring bug" reasoning every other page in this shell already states for
      // its own equivalent check. `usePollUntilErased` only ever calls this while `erasing` is true,
      // which itself only follows a successful `eraseSite` call that required a real token, so this
      // branch is not expected to run.
      return Promise.resolve("unknown");
    }
    return checkOperatorErasure(accessToken);
  }, [accessToken]);

  const onErased = useCallback(() => {
    void logout();
  }, [logout]);

  usePollUntilErased(erasing, ACCOUNT_ERASURE_POLL_INTERVAL_MS, checkErased, onErased);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(SITE_ERASE_PERMISSION)) {
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return (
      <AccessRefusal title={strings.accountDeletionTitle} message={strings.accountDeletionForbidden} strings={strings} />
    );
  }

  const attempt = async () => {
    if (!accessToken) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await eraseSite(accessToken);
      setConfirming(false);
      setErasing(true);
    } catch (reason) {
      setSubmitError(reason instanceof ApiProblemError ? reason.message : strings.accountDeletionSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead title={strings.accountDeletionTitle} description={strings.accountDeletionDescription} />

      {erasing ? (
        // `role="status"`, not `"alert"` - `Alert tone="danger"` is used here for its visual weight
        // (this is the one screen in the console where "danger" red is the honest colour for a state
        // that is not actually a failure), but the live-region semantics that matter are "update me
        // politely as this progresses", which is what `tone="danger"`'s `role="alert"` does not give.
        // Accepted as-is rather than adding a fourth `Alert` tone for one screen - `Alert`'s own doc
        // comment hard-codes the tone-to-role pairing deliberately, and widening it is a bigger change
        // than this item's scope.
        <Alert tone="danger" title={strings.accountDeletionInProgressTitle}>
          {strings.accountDeletionInProgressBody}
          <div className="ago-row">
            <Spinner label={strings.accountDeletionInProgressTitle} labelHidden />
          </div>
        </Alert>
      ) : (
        <Panel title={strings.accountDeletionPanelTitle}>
          <div className="ago-stack">
            <p>{strings.accountDeletionWarningBody}</p>

            {submitError && <Alert tone="danger">{submitError}</Alert>}

            <div className="ago-row">
              <Button
                variant="danger"
                onClick={() => {
                  setSubmitError(null);
                  setConfirming(true);
                }}
              >
                {strings.accountDeletionButton}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Dialog
        open={confirming}
        title={strings.accountDeletionDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={submitting}>
              {strings.accountDeletionConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.accountDeletionDialogBody}</p>
      </Dialog>
    </>
  );
}
