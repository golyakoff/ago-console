import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";

export interface RemoveTeamMessageButtonProps {
  /** Runs the actual call. Injected rather than called here, the same "the page owns the request,
   * this owns the interaction around it" split `RemoveOperatorButton`'s own doc comment establishes -
   * this component takes no connection, no message id beyond what its caller already closed over. */
  onRemove: () => Promise<void>;
}

/**
 * `23-33`: the row action `TeamChatPage` offers per message, to whichever operator currently holds
 * `site:manage_operators` - modeled on `RemoveOperatorButton`'s own synchronous confirm-then-call
 * shape, for the identical reason: removal here is a settled state the moment the hub call resolves
 * (`RemoveTeamMessageHandler`'s own `RemovedAt` is set inside that same call), not a background job
 * a screen would need to poll for.
 *
 * <b>The confirmation states the consequence, not just the fact</b> - the same `RemoveOperatorButton`
 * precedent this component follows: `teamChatRemoveDialogBody` names what every other operator in the
 * room will see in this message's place, rather than a generic "this cannot be undone" that leaves
 * the actual mechanism a surprise.
 */
export function RemoveTeamMessageButton({ onRemove }: RemoveTeamMessageButtonProps) {
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
    } catch {
      // HubException surfaces as a plain Error here (SignalR's own client-side shape) - no
      // ApiProblemError to unwrap the way RemoveOperatorButton's REST call gets one.
      setFailure(strings.teamChatRemoveError);
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
        {strings.teamChatRemoveButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.teamChatRemoveDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attempt()} disabled={busy}>
              {strings.teamChatRemoveConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.teamChatRemoveDialogBody}</p>

        {failure && <Alert tone="danger">{failure}</Alert>}
      </Dialog>
    </>
  );
}
