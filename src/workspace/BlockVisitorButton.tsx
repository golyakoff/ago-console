import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";

/** `24-10`'s own permission, reused rather than a new one - `ago-chat`'s `BlockVisitorHandler`'s own
 * remarks explain why: blocking a visitor indefinitely is the identical capability `conversation:block`
 * already named, now finally given the visitor-scoped mechanism its name always implied. */
export const BLOCK_VISITOR_PERMISSION = "conversation:block";

export interface BlockVisitorButtonProps {
  onBlock: () => Promise<void>;
  /** Told once the block actually applied - unlike closing, this does not end the conversation, so
   * the page has nothing to drop from the rail; it exists only so a caller can, e.g., show a brief
   * confirmation. */
  onBlocked: () => void;
}

/**
 * `23-77`: the console's own half of "block visitor" - `ago-chat` shipped `24-10`'s own `/block`
 * endpoint with no console screen to call it from at all, and it never will be: this button calls the
 * new `/block-visitor` route instead, which writes the visitor-scoped restriction the item actually
 * needed (`BlockVisitorHandler`'s own remarks on why `24-10`'s own mechanism is left untouched).
 *
 * Deliberately its own button, not folded into `CloseAsSpamButton`/`CloseConversationButton`:
 * blocking does not close the conversation (an operator may still want to read it, or close it
 * separately) and carries the Admin-only `conversation:block` permission, a materially larger blast
 * radius than either close action.
 *
 * Hidden, not disabled, for an operator without `conversation:block` - the same product decision
 * every other permission-gated console control in this file's own family already makes.
 */
export function BlockVisitorButton({ onBlock, onBlocked }: BlockVisitorButtonProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  if (!hasPermission(BLOCK_VISITOR_PERMISSION)) {
    return null;
  }

  const attempt = async () => {
    setBusy(true);
    setFailureMessage(null);
    try {
      await onBlock();
      setConfirming(false);
      onBlocked();
    } catch (reason) {
      if (reason instanceof ApiProblemError && reason.code === "Conversation.NotFound") {
        setFailureMessage(strings.blockVisitorOutcomeNotFound);
      } else if (reason instanceof ApiProblemError && reason.code === "Conversation.Forbidden") {
        setFailureMessage(strings.blockVisitorOutcomeNoPermission);
      } else if (reason instanceof ApiProblemError) {
        // A code this console has never heard of - the server's own wording reaches the operator
        // unedited, the same `closeOutcomeFor`-established fallback for an unrecognised `type`.
        setFailureMessage(reason.message);
      } else {
        setFailureMessage(strings.closeOutcomeNetworkError);
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
          setFailureMessage(null);
          setConfirming(true);
        }}
      >
        {strings.blockVisitorButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.blockVisitorDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={busy}>
              {strings.blockVisitorConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.blockVisitorDialogBody}</p>

        {failureMessage && <Alert tone="danger">{failureMessage}</Alert>}
      </Dialog>
    </>
  );
}
