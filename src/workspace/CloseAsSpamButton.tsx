import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { closeOutcomeFor } from "./closeOutcome.js";

/** `23-69`'s own dedicated permission, gating this action and nothing else - see `ago-chat`'s
 * `Permission.ConversationMarkSpam` for the full reasoning (Operator-role, unlike `24-10`'s
 * `conversation:block`). */
export const CLOSE_AS_SPAM_PERMISSION = "conversation:mark_spam";

export interface CloseAsSpamButtonProps {
  /** Runs the actual call and hands back when the resulting mute lifts on its own - injected, the
   * same "the page owns the request, this owns the interaction" split `CloseConversationButton`
   * already uses. */
  onCloseAsSpam: () => Promise<{ mutedUntil: string }>;
  /** Told when the close succeeded, mirroring `CloseConversationButton.onClosed` exactly - the page
   * reacts to a conversation ending the same way regardless of which button ended it. */
  onClosed: () => void;
  onStaleQueue: () => void;
}

/**
 * `23-69`: the console's own half of "close as spam" - `ago-chat` shipped the mechanism (one act:
 * close, and mute the visitor for a stated window) with no way to press it. Deliberately a second,
 * separate button next to `CloseConversationButton` rather than a checkbox on it: the two actions
 * carry different permissions and different consequences (an ordinary close only ends this
 * conversation; this one also silently keeps every conversation this visitor opens next on this site
 * from reaching an operator, for a while) - folding them into one control would hide that difference
 * behind a checkbox nobody reads.
 *
 * Reuses `closeOutcomeFor` for its own failures rather than a second decision function:
 * `CloseConversationAsSpamHandler` reports the identical `Conversation.Forbidden`/`InvalidState`/
 * `ConcurrencyConflict`/`NotFound` vocabulary plain closing does, for the same reasons.
 *
 * Hidden, not disabled, for an operator without `conversation:mark_spam` - the same product decision
 * `CloseConversationButton`'s own remarks state in full.
 */
export function CloseAsSpamButton({ onCloseAsSpam, onClosed, onStaleQueue }: CloseAsSpamButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);

  if (!hasPermission(CLOSE_AS_SPAM_PERMISSION)) {
    return null;
  }

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onCloseAsSpam();
      setConfirming(false);
      onClosed();
    } catch (reason) {
      const outcome = closeOutcomeFor(reason, true, strings);
      setFailure({ message: outcome.message, retryable: outcome.retryable });
      if (outcome.refreshQueue) {
        onStaleQueue();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setFailure(null);
          setConfirming(true);
        }}
      >
        {strings.closeAsSpamButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.closeAsSpamDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={busy}>
              {failure?.retryable === true ? strings.closeTryAgainButton : strings.closeAsSpamConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.closeAsSpamDialogBody}</p>

        {failure && <Alert tone="danger">{failure.message}</Alert>}
      </Dialog>
    </>
  );
}
