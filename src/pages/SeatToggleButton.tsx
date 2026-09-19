import { useState } from "react";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { ROLE_ADMIN } from "../api/operatorTeamApi.js";

export interface SeatToggleButtonProps {
  /** `25-170`: which `(operator, role)` pairing this button toggles - an operator can now hold up to
   * two independent seats (one per seeded role), so the button's own label must name which one, the
   * same reason {@link "./ChangeOperatorRoleButton.js".ChangeOperatorRoleButtonProps} already needs to
   * know which role it moves an operator into. */
  roleName: string;
  holdsSeat: boolean;
  /** Runs the actual `POST .../seat` call with the new value. Injected, the same "the page owns the
   * request" split every other row action in this screen already follows. */
  onToggle: (holdsSeat: boolean) => Promise<void>;
  /** Told once the toggle succeeds, so the page can refresh the seat summary - every role's own
   * `heldSeats`/`overLimit` depends on this row's own new value. */
  onToggled: () => void;
}

/**
 * `23-22`: no confirmation dialog, unlike {@link "./RemoveOperatorButton.js".RemoveOperatorButton} -
 * a seat toggle is reversible (toggled back on with the same click, no data lost either way), the same
 * "destructive gets a real confirmation, reversible does not" line this codebase already draws between
 * `CloseConversationButton`'s dialog and, say, a plain presence toggle. Revoking a seat on a role this
 * operator holds no seat left on at all does block their next sign-in
 * (`authorization.md`'s "seat assignment blocks sign-in" - `CanSignIn` is "does any held role still
 * hold its own seat") but never touches their conversations, intervals or history, unlike removal.
 *
 * `25-170`: role-qualified button text (`operatorsTeamGrant/RevokeOperator/AdminSeatButton`), not the
 * pre-`25-170` role-agnostic "Grant seat"/"Revoke seat" - a row can now show one of these per role the
 * operator holds, and an unqualified label would leave which seat is being toggled ambiguous the
 * moment a row shows more than one.
 */
export function SeatToggleButton({ roleName, holdsSeat, onToggle, onToggled }: SeatToggleButtonProps) {
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onToggle(!holdsSeat);
      onToggled();
    } catch (reason) {
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.operatorsTeamSeatToggleError);
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = roleName === ROLE_ADMIN;
  const label = isAdmin
    ? holdsSeat
      ? strings.operatorsTeamRevokeAdminSeatButton
      : strings.operatorsTeamGrantAdminSeatButton
    : holdsSeat
      ? strings.operatorsTeamRevokeOperatorSeatButton
      : strings.operatorsTeamGrantOperatorSeatButton;

  return (
    <div className="ago-stack">
      <Button size="sm" variant="ghost" onClick={() => void attempt()} disabled={busy}>
        {label}
      </Button>
      {failure && <Alert tone="danger">{failure}</Alert>}
    </div>
  );
}
