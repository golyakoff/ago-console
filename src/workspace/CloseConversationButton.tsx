import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { closeOutcomeFor } from "./closeOutcome.js";

/** `6-02`'s dedicated permission (`conversation:close`), named once here rather than spelled out at
 * each of the two places that ask about it. */
export const CLOSE_PERMISSION = "conversation:close";

export interface CloseConversationButtonProps {
  /** Runs the actual call. Injected rather than called here so this component takes no access token
   * and no API module - the page owns the request, this owns the interaction around it. */
  onClose: () => Promise<void>;
  /** Told when the close succeeded, so the page can drop the composer and the layout can re-read the
   * queue. */
  onClosed: () => void;
  /** Told when a failure means this tab's view of the queue is stale (`closeOutcome.ts`). */
  onStaleQueue: () => void;
}

/**
 * `11-09`: the control `6-02` shipped a server for in Stage 6 and nobody could press.
 *
 * ## Hidden, not disabled
 *
 * An operator without `conversation:close` sees **nothing here at all** - no greyed-out button, no
 * tooltip explaining what they cannot do. That is the console's existing idiom (`attachment:delete`
 * in `ConversationPage`, the permission-gated navigation in `OperatorShell`) and it is a product
 * decision rather than a styling one: a disabled control still advertises that the action exists and
 * still ships its markup to somebody who will never use it. The test for this asserts the button is
 * *absent* and additionally that nothing disabled is wearing its label, because "hidden" and
 * "disabled" are one CSS class apart and only one of them is what the item asked for.
 *
 * <b>It is not the security boundary and must not be read as one.</b> `CloseConversationHandler`
 * checks `Permission.ConversationClose` server-side on every call, and this console's permission
 * snapshot is from sign-in - which is exactly why `closeOutcome.ts` still has a branch for a `403`
 * that reaches an operator who thought they held it.
 *
 * ## A confirmation, and why a real one
 *
 * Closing is terminal - `Conversation.Close()` has no path back by its own domain invariant
 * (`6-02`'s Out of scope: reopening "is new domain design, not a wiring task"), and it hands the
 * operator's capacity claim back to the assignment engine, which may hand them a different
 * conversation seconds later. A misfire is not recoverable from this screen, so it gets the
 * `Dialog` `11-05` shipped and `18-05` gave its first consumer - native `<dialog>`, so focus
 * trapping, Escape and inertness are the platform's rather than hand-rolled, and `adr/0030`'s set
 * stays closed at eleven.
 */
export function CloseConversationButton({ onClose, onClosed, onStaleQueue }: CloseConversationButtonProps) {
  const { hasPermission } = usePermissions();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);

  if (!hasPermission(CLOSE_PERMISSION)) {
    return null;
  }

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onClose();
      setConfirming(false);
      onClosed();
    } catch (reason) {
      const outcome = closeOutcomeFor(reason, true);
      // The dialog stays open on failure. The operator is mid-decision, and dismissing it would put
      // the explanation somewhere they are no longer looking.
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
        Close conversation
      </Button>

      <Dialog
        open={confirming}
        title="Close this conversation?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            {/* `danger`, because this is the irreversible one. The label says what it does rather
                than "OK" - a confirmation whose buttons are "OK" and "Cancel" makes the operator
                re-read the question to work out which is which. */}
            <Button variant="danger" onClick={() => void attempt()} disabled={busy}>
              {failure?.retryable === true ? "Try again" : "Close it"}
            </Button>
          </>
        }
      >
        <p>
          The visitor&rsquo;s chat ends and this conversation cannot be reopened. Closing it also
          frees your capacity, so you may be assigned a new conversation straight away.
        </p>

        {failure && <Alert tone="danger">{failure.message}</Alert>}
      </Dialog>
    </>
  );
}
