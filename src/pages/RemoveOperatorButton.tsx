import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";

export interface RemoveOperatorButtonProps {
  /** The name shown in the confirmation, exactly like the row itself renders it -
   * `OperatorsTeamPage`'s own fallback for an unnamed operator, passed through rather than
   * recomputed here. */
  displayName: string;
  /** Runs the actual call. Injected rather than called here, the same "the page owns the request,
   * this owns the interaction around it" split `CloseConversationButton`'s own doc comment
   * establishes - this component takes no access token, no site id, no API module. */
  onRemove: () => Promise<void>;
  /** Told once removal succeeds, so the page can drop the row and refresh the seat summary. */
  onRemoved: () => void;
}

/**
 * `23-22`: the row action `OperatorsTeamPage` offers per active operator - modeled on
 * `CloseConversationButton`'s own synchronous confirm-then-call shape, not
 * `EraseConversationButton`'s polling one: `RemoveOperatorHandler`'s own `204` *is* the settled
 * state (`Operator.RemovedAt` is set in the same request/transaction that responds), unlike
 * conversation erasure's `202 Accepted`, which only starts a `Ago.Chat.Worker` job. What happens
 * next - `Ago.Chat.Worker`'s `OperatorRemovedConsumer` releasing this operator's assigned
 * conversations back to `Waiting` - is a real, separate step (the outbox, CLAUDE.md rule 4), but
 * nothing on this screen needs to observe it complete: the tenant's own next action is not blocked
 * on it the way `AccountDeletionPage`'s sign-out is blocked on its own poll actually finishing.
 *
 * <b>The confirmation states the consequence, not just the fact.</b> This item's own Scope calls
 * this out by name: "somebody removing a colleague mid-shift should know that before clicking, not
 * after" - so `operatorsTeamRemoveDialogBody` names the release-to-Waiting behaviour directly,
 * rather than a generic "this cannot be undone" that leaves the actual mechanism a surprise.
 */
export function RemoveOperatorButton({ displayName, onRemove, onRemoved }: RemoveOperatorButtonProps) {
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onRemove();
      setConfirming(false);
      onRemoved();
    } catch (reason) {
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.operatorsTeamRemoveError);
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
        {strings.operatorsTeamRemoveButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.operatorsTeamRemoveDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={busy}>
              {strings.operatorsTeamRemoveConfirmButton}
            </Button>
          </>
        }
      >
        <p>
          <strong>{displayName}</strong> {strings.operatorsTeamRemoveDialogBody}
        </p>

        {failure && <Alert tone="danger">{failure}</Alert>}
      </Dialog>
    </>
  );
}
