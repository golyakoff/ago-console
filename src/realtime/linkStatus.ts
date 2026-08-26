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

const STATUSES: Record<LinkState, Omit<LinkStatus, "state">> = {
  connected: {
    tone: "success",
    label: "Live",
    detail: "Connected to the operator hub. New messages arrive without a refresh.",
    healthy: true,
  },
  connecting: {
    tone: "neutral",
    label: "Connecting…",
    detail: "Opening the operator hub connection.",
    healthy: false,
  },
  reconnecting: {
    tone: "accent",
    label: "Reconnecting…",
    detail:
      "The connection dropped and is being retried with backoff. Messages sent right now will fail and can be retried; nothing sent to you while you are away is lost - the reconnect resumes from your last received message.",
    healthy: false,
  },
  draining: {
    tone: "brand",
    label: "Server restarting",
    detail:
      "The server asked this console to reconnect before it shuts down. You are still connected and can still send; expect a brief reconnect shortly.",
    healthy: true,
  },
  disconnected: {
    tone: "danger",
    label: "Offline",
    detail:
      "Not connected to the operator hub. Messages you send will fail until the connection returns. Reloading rarely helps - if this persists, the browser console carries the reason the connection was refused (5-18).",
    healthy: false,
  },
};

/**
 * `draining` outranks `connected` and nothing else: the drain hint means the *currently healthy*
 * connection is about to go away, so it is only interesting while the connection is in fact up. Once
 * the drop actually happens, `reconnecting` is the more useful, more urgent truth, and the hint has
 * done its job.
 */
export function linkStatusOf(connectionState: ConnectionState, serverDraining: boolean): LinkStatus {
  const state: LinkState = serverDraining && connectionState === "connected" ? "draining" : connectionState;
  return { state, ...STATUSES[state] };
}
