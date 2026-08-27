import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import type { ConnectionState } from "./operatorConnection.js";

/**
 * `11-06`: the operator hub's state as something an operator can act on, rather than the raw enum
 * name `5-07` printed and `11-05` put in a badge.
 *
 * The item asks for an indicator that shows "reconnecting and degraded" **honestly**, and the honest
 * part is the constraint, not the decoration. There are exactly five states this client can actually
 * observe:
 *
 * | State | Where it comes from |
 * |---|---|
 * | `connecting` | `OperatorConnection.start()` before the handshake completes |
 * | `connected` | the handshake completed, or `resumeAfterReconnect` finished |
 * | `reconnecting` | `HubConnection.onreconnecting` - SignalR's own automatic reconnect, backing off with jitter (`backoff.ts`) |
 * | `disconnected` | `HubConnection.onclose` - reconnect attempts exhausted, or never started |
 * | `draining` | the server pushed `"Reconnect"` (`ConnectionDrainCoordinator`, `Ago.Platform.Realtime`) - a real protocol event this console has been able to receive since `5-07` and, until this item, did nothing with |
 *
 * `draining` is the "degraded" state, and it is the only degradation a client can honestly claim.
 * `realtime.md`'s failure table lists others - Redis down degrades cross-node delivery, the broker
 * being down makes sends fail - but **none of them is observable from a browser**: a client whose
 * fan-out is degraded sees a perfectly healthy WebSocket and simply receives a message later than it
 * otherwise would. Painting an indicator amber for those would mean inventing a state the system
 * does not report, which is precisely what the item says not to do. The transport falling back from
 * WebSockets to long-polling is a second genuine degradation, and it is *not* here for a narrower
 * reason: `@microsoft/signalr`'s `HubConnection` exposes no public API for the negotiated transport,
 * and reaching into its private `_httpConnection` to find out would be a lie of a different kind.
 *
 * Pure, and separate from the component that renders it, so the mapping is testable without a DOM.
 */
export type LinkState = ConnectionState | "draining";

export type LinkTone = "neutral" | "brand" | "accent" | "success" | "danger";

export interface LinkStatus {
  state: LinkState;
  tone: LinkTone;
  /** The word on the badge. Always present - the state is never carried by colour alone. */
  label: string;
  /** One sentence saying what it means for the operator right now, for the badge's `title` and for
   * the workspace's own inline explanation when the link is not healthy. */
  detail: string;
  /** Whether an attempted send is expected to reach the server. Never used to *disable* the
   * composer: a send attempted on a dead connection fails loudly and retryably
   * (`NotConnectedError` -> the retry affordance), which is far better than a composer that silently
   * refuses to do anything and leaves the operator wondering. */
  healthy: boolean;
}

/**
 * `11-12`: a function of `strings` rather than a module-level constant, for the same reason
 * `closeOutcome.ts`'s messages moved behind a parameter - this table used to be built once from
 * hard-coded English, and a link-state sentence is exactly the kind of workspace text this item's
 * scope names ("connection/reconnection indicator") explicitly.
 */
function statusesFor(strings: ConsoleStrings): Record<LinkState, Omit<LinkStatus, "state">> {
  return {
    connected: {
      tone: "success",
      label: strings.linkLiveLabel,
      detail: strings.linkLiveDetail,
      healthy: true,
    },
    connecting: {
      tone: "neutral",
      label: strings.linkConnectingLabel,
      detail: strings.linkConnectingDetail,
      healthy: false,
    },
    reconnecting: {
      tone: "accent",
      label: strings.linkReconnectingLabel,
      detail: strings.linkReconnectingDetail,
      healthy: false,
    },
    draining: {
      tone: "brand",
      label: strings.linkDrainingLabel,
      detail: strings.linkDrainingDetail,
      healthy: true,
    },
    disconnected: {
      tone: "danger",
      label: strings.linkDisconnectedLabel,
      detail: strings.linkDisconnectedDetail,
      healthy: false,
    },
  };
}

/**
 * `draining` outranks `connected` and nothing else: the drain hint means the *currently healthy*
 * connection is about to go away, so it is only interesting while the connection is in fact up. Once
 * the drop actually happens, `reconnecting` is the more useful, more urgent truth, and the hint has
 * done its job.
 *
 * `strings` is defaulted to `en`, matching `closeOutcomeFor`/`alertTextFor`: `WorkspaceLayout` calls
 * this directly from render (and can pass its own `useStrings()` value), but `linkStatus.test.ts`'s
 * existing two-argument calls assert the English sentences on purpose and this keeps them unedited.
 */
export function linkStatusOf(connectionState: ConnectionState, serverDraining: boolean, strings: ConsoleStrings = en): LinkStatus {
  const state: LinkState = serverDraining && connectionState === "connected" ? "draining" : connectionState;
  return { state, ...statusesFor(strings)[state] };
}
