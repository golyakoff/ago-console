import { useState } from "react";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { ROLE_ADMIN, ROLE_OPERATOR } from "../api/operatorTeamApi.js";

export interface ChangeOperatorRoleButtonProps {
  /** Whether this row currently holds `site:manage_operators` (i.e. the `Admin` role) - decides which
   * direction the button offers, the same "the button names the row's own next state" shape
   * `SeatToggleButton` already uses for `holdsSeat`. */
  isAdmin: boolean;
  /** The name shown in the confirmation, exactly like `RemoveOperatorButton`'s own prop. */
  displayName: string;
  /** Runs the actual call. Injected, the same "the page owns the request" split every other row action
   * on this screen already follows. */
  onChange: (newRoleName: string) => Promise<void>;
  /** Told once the change succeeds, so the page can refresh the team list. */
  onChanged: () => void;
}

/**
 * `23-72`: "an administrator can change an existing colleague's role, both directions." Confirmed like
 * {@link "./RemoveOperatorButton.js".RemoveOperatorButton}, not left un-confirmed like
 * {@link "./SeatToggleButton.js".SeatToggleButton} - a role change is a real authorization change in
 * either direction (it can end a colleague's ability to administer, or grant it), not the reversible,
 * no-consequence toggle a seat is. The confirmation names what the colleague gains or loses, the same
 * "state the consequence, not just the fact" rule `RemoveOperatorButton`'s own dialog already follows.
 *
 * The server's own refusal (the last-administrator guard,
 * `Ago.Chat.Application.UseCases.ChangeOperatorRole.ChangeOperatorRoleHandler`) surfaces here verbatim
 * via `ApiProblemError.message` - this component invents no wording of its own, the same "the server's
 * own message, not a generic re-statement" rule `RemoveOperatorButton` follows for
 * `Operator.IsLastManager`.
 */
export function ChangeOperatorRoleButton({ isAdmin, displayName, onChange, onChanged }: ChangeOperatorRoleButtonProps) {
  const strings = useStrings();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const nextRoleName = isAdmin ? ROLE_OPERATOR : ROLE_ADMIN;

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onChange(nextRoleName);
      setConfirming(false);
      onChanged();
    } catch (reason) {
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.operatorsTeamChangeRoleError);
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
        {isAdmin ? strings.operatorsTeamChangeRoleToOperatorButton : strings.operatorsTeamChangeRoleToAdminButton}
      </Button>

      <Dialog
        open={confirming}
        title={strings.operatorsTeamChangeRoleDialogTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {strings.cancelButton}
            </Button>
            <Button variant="primary" onClick={() => void attempt()} disabled={busy}>
              {strings.operatorsTeamChangeRoleConfirmButton}
            </Button>
          </>
        }
      >
        <p>
          <strong>{displayName}</strong>{" "}
          {isAdmin ? strings.operatorsTeamChangeRoleToOperatorDialogBody : strings.operatorsTeamChangeRoleToAdminDialogBody}
        </p>

        {failure && <Alert tone="danger">{failure}</Alert>}
      </Dialog>
    </>
  );
}
