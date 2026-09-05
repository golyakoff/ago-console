import { useState } from "react";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";
import { ApiProblemError } from "../api/problemDetails.js";

export interface SeatToggleButtonProps {
  holdsSeat: boolean;
  /** Runs the actual `POST .../seat` call with the new value. Injected, the same "the page owns the
   * request" split every other row action in this screen already follows. */
  onToggle: (holdsSeat: boolean) => Promise<void>;
  /** Told once the toggle succeeds, so the page can refresh the seat summary - `HeldSeats`/`OverSeats`
   * both depend on this row's own new value. */
  onToggled: () => void;
}

/**
 * `23-22`: no confirmation dialog, unlike {@link "./RemoveOperatorButton.js".RemoveOperatorButton} -
 * `Operator.ToggleSeat` is reversible (toggled back on with the same click, no data lost either way),
 * the same "destructive gets a real confirmation, reversible does not" line this codebase already
 * draws between `CloseConversationButton`'s dialog and, say, a plain presence toggle. Revoking a seat
 * does block that operator's next sign-in (`authorization.md`'s "seat assignment blocks sign-in" -
 * `ResolveOperatorIdentityHandler` resolves no claim for a seatless row) but never touches their
 * conversations, intervals or history, unlike removal.
 */
export function SeatToggleButton({ holdsSeat, onToggle, onToggled }: SeatToggleButtonProps) {
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

  return (
    <div className="ago-stack">
      <Button size="sm" variant="ghost" onClick={() => void attempt()} disabled={busy}>
        {holdsSeat ? strings.operatorsTeamRevokeSeatButton : strings.operatorsTeamGrantSeatButton}
      </Button>
      {failure && <Alert tone="danger">{failure}</Alert>}
    </div>
  );
}
