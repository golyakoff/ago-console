import { useState } from "react";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `23-20`: the operator's own deliberate "I am stepping away" control - `flows.md` 2.5's own gap,
 * "the act has no surface, so it is not performed, and the visitor is told something untrue on the
 * strength of it". Deliberately distinct from `ConnectionStateBadge` beside it in `WorkspaceLayout`:
 * that badge's five labels (`ui-inventory.md` §3.1) are all about the *connection* - is the socket up -
 * never about the person. Folding "away" into that badge as a sixth label would answer a different
 * question with the same widget and reintroduce the exact confusion this item's own "Context to read
 * first" names, so this is a second, separately labelled control instead.
 *
 * **Every string names the effect on a visitor, never just "Away"/"Online".** A label alone repeats
 * the problem in a smaller font - the item's own wording. `workspaceAwayGoAwayDetail`/
 * `workspaceAwayComeBackDetail` ride as the button's `title`, said *before* the click
 * (`ConnectionStateBadge`'s own precedent for a title carrying the sentence, not just the button
 * itself); `workspaceAwayActiveNotice` is a persistent, visible `Alert` while away, not a tooltip -
 * the effect is happening right now, not merely on the next click, and hiding an active effect behind
 * a hover is the same honesty failure this item exists to fix, just moved into this control.
 *
 * **Not a twelfth `adr/0030` component.** The same reasoning as `ConnectionStateBadge`'s own doc
 * comment: this is a fixed, product-specific composition of two of the eleven generic primitives
 * (`Button`, `Alert`) - it introduces no new interaction pattern, focus behaviour or ARIA role of its
 * own that either primitive does not already provide.
 *
 * Local `pending`/`error` state, not lifted to `OperatorConnectionContext`: nothing else in the
 * workspace needs to know a toggle is in flight, and `SetAwayAsync`'s own failure mode (a dropped
 * connection mid-invoke) is exactly the shape `NotConnectedError`/`SendOutcomeUnknownError` already
 * exist for elsewhere in this codebase - reported here, not swallowed, so the operator is not left
 * believing a click landed when it did not.
 */
export function AwayControl({ isAway, onToggle }: { isAway: boolean; onToggle: (away: boolean) => Promise<void> }) {
  const strings = useStrings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setPending(true);
    setError(null);
    onToggle(!isAway)
      .catch((err: unknown) => {
        // Never silently absorbed: a control whose click did nothing and says nothing is the exact
        // failure this item exists to close, just moved from "no surface at all" to "a surface that
        // lies about whether it worked".
        setError(err instanceof Error ? err.message : strings.workspaceAwayToggleError);
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="ago-workspace__rail-tools">
      <Button
        size="sm"
        variant={isAway ? "primary" : "ghost"}
        disabled={pending}
        title={isAway ? strings.workspaceAwayComeBackDetail : strings.workspaceAwayGoAwayDetail}
        onClick={handleClick}
      >
        {isAway ? strings.workspaceAwayComeBackButton : strings.workspaceAwayGoAwayButton}
      </Button>

      {isAway && <Alert tone="info">{strings.workspaceAwayActiveNotice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
