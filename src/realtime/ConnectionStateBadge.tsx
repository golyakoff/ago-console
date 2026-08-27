import { Badge } from "../components/Badge.js";
import { useStrings } from "../i18n/StringsContext.js";
import { linkStatusOf } from "./linkStatus.js";
import type { ConnectionState } from "./operatorConnection.js";

/**
 * `11-05` turned `Operator hub: {connectionState}` - a raw enum name printed inside a paragraph -
 * into a `Badge`. `11-06` gives it the states the protocol really has, including the two the item
 * names: `reconnecting`, and the one genuinely observable degradation, `draining` (the server's own
 * `"Reconnect"` push). `linkStatus.ts` owns that mapping and, more importantly, owns the argument
 * for why the *other* degradations in `realtime.md`'s failure table are deliberately absent.
 *
 * Still not a twelfth entry on `adr/0030`'s closed component list, for the same reason as before:
 * the eleven are generic primitives that know nothing about this product, and this is a fixed
 * mapping from one product's connection states onto a tone and a sentence. It is built *out of* one
 * of the eleven.
 *
 * The state is never carried by colour alone - the word is always rendered, and the sentence from
 * `linkStatus` rides along as the `title`, so the badge answers "and what does that mean for me"
 * without the operator having to know what a hub is.
 */
export function ConnectionStateBadge({
  state,
  serverDraining = false,
}: {
  state: ConnectionState;
  serverDraining?: boolean;
}) {
  const strings = useStrings();
  const status = linkStatusOf(state, serverDraining, strings);

  return (
    <span title={status.detail}>
      <Badge tone={status.tone} dot>
        <span className="ago-visually-hidden">{strings.connectionBadgeAriaPrefix}</span>
        {status.label}
      </Badge>
    </span>
  );
}
