import { Badge } from "../components/Badge.js";
import type { ConnectionState } from "./operatorConnection.js";

const TONE: Record<ConnectionState, "success" | "neutral" | "danger"> = {
  connected: "success",
  connecting: "neutral",
  reconnecting: "neutral",
  disconnected: "danger",
};

const LABEL: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

/**
 * `11-05`. The operator hub's own state, rendered as a `Badge`.
 *
 * It lives beside the connection it describes rather than in `src/components/`, and it is
 * deliberately *not* a twelfth entry on the item's closed component list: the eleven are generic
 * primitives with no knowledge of this product, and this is the opposite - a fixed mapping from
 * `ConnectionState`'s four values to a tone and a sentence, useful to exactly the two pages that
 * are inside `OperatorConnectionProvider`. Putting it in the design system would have meant a
 * component library that knows what a SignalR connection is.
 *
 * The state is never carried by colour alone: the word is always there, which is what the two pages
 * printed as `Operator hub: {connectionState}` before this item and what a screen reader still gets.
 * The raw lowercase value becomes a sentence here because "reconnecting" is a state an operator has
 * to act on (stop typing, wait) and a bare enum name buried in a paragraph did not read as one.
 */
export function ConnectionStateBadge({ state }: { state: ConnectionState }) {
  return (
    <Badge tone={TONE[state]} dot>
      <span className="ago-visually-hidden">Operator hub:</span>
      {LABEL[state]}
    </Badge>
  );
}
