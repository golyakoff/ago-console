import * as signalR from "@microsoft/signalr";
import { config } from "../config.js";
import { getActiveSiteId } from "../api/activeSite.js";
import { defaultBackoffOptions, jitteredDelayMs } from "./protocol/backoff.js";

export type CalendarConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * `25-63`: the wire shape `Ago.Calendar.Contracts.BookingPendingStateChanged` serializes to
 * (camelCase, `WireJsonOptions` - see that type's own remarks for why the outbox payload and this
 * hub push use the identical options). `status` is one of `Ago.Calendar.Domain.EventStatus`'s three
 * relevant member names (`"PendingConfirmation"`, `"Booked"`, `"Cancelled"`) as a plain string, not a
 * union type here - this connection does not branch on it, only passes it through to whatever
 * listener re-reads the queue.
 */
export interface PendingBookingsChangedDto {
  eventId: string;
  tenantId: string;
  status: string;
  occurredAt: string;
  correlationId: string;
}

/**
 * `25-63`: the calendar backend's own hub connection - a **parallel, calendar-specific class**, not
 * `OperatorConnection` reused or generalised to a second hub. That is a deliberate choice, not an
 * oversight, and the reasoning is worth stating because the backlog item's own Scope asks for it
 * explicitly:
 *
 * <ul>
 * <li><b>Genuinely different backends.</b> `Ago.Chat.Api`'s operator hub and `Ago.Calendar.Api`'s own
 * `CalendarOperatorHub` are different origins, different deployables, different failure domains
 * (`docs/architecture/repositories.md`) - only the bearer token and the active-site signal are
 * shared, both already product-agnostic values this file reads the same way `operatorConnection.ts`
 * does.</li>
 * <li><b>`OperatorConnection` is almost entirely chat protocol, not connection plumbing.</b> Message
 * history, `clientMessageId` retry-dedup, per-conversation sequence tracking, team-chat send/receive,
 * visitor presence - none of it applies here. This hub is push-only and carries exactly one server
 * message (`PendingBookingsChanged`); folding that into `OperatorConnection` would mean either a
 * second constructor mode threading an `if (isCalendar)` through a class that is otherwise a single
 * coherent protocol, or a shared base class factored out for a "shared surface" that is, in practice,
 * `withAutomaticReconnect`'s backoff curve and nothing else content-bearing.</li>
 * <li><b>What genuinely is shared, is shared: `protocol/backoff.ts`.</b> The jittered
 * full-reconnect-backoff curve is product-agnostic on its face (concurrency.md's rolling-deploy
 * thundering-herd reasoning applies to any SignalR client equally), so this file imports and reuses
 * it rather than re-deriving the same formula - the one piece of `operatorConnection.ts` that was
 * actually worth not duplicating.</li>
 * </ul>
 *
 * No message dedup, no sequence tracker, no subscription-replay-on-reconnect: this connection's one
 * push is idempotent by construction (a "re-read the queue" signal a caller can act on any number of
 * times with the identical correct result), so none of `dedup.ts`/`sequence.ts`'s machinery - built
 * for a conversation's own ordered, exactly-once-rendered message stream - has anything to do here.
 */
export class CalendarOperatorConnection {
  private connection: signalR.HubConnection | null = null;
  private readonly accessTokenFactory: () => string;
  private stateListener: ((state: CalendarConnectionState) => void) | null = null;
  private pendingBookingsChangedListener: ((dto: PendingBookingsChangedDto) => void) | null = null;

  /** `accessTokenFactory` (the field) is a factory, not a token, for the identical `5-16` reason
   * `OperatorConnection`'s own constructor states - it is called on every connect and reconnect
   * attempt, so a renewed Keycloak token is always the one actually sent. The same bearer token
   * `OperatorConnection` uses: both hubs sit behind the identical Keycloak realm
   * (`AuthenticationSetup`'s own "one scheme, not two" remarks, `Ago.Calendar.Api`), so there is no
   * second sign-in and no second token to manage. */
  constructor(accessTokenRef: { readonly current: string | undefined }) {
    this.accessTokenFactory = () => accessTokenRef.current ?? "";
  }

  /**
   * Builds the underlying `signalR.HubConnection` on first use, the identical "read the active-site
   * signal at first `start()`, not at construction" timing `OperatorConnection.ensureConnection`
   * uses and for the identical reason (`13-07`/`adr/0068`): a multi-tenancy identity's active site is
   * not reliably known yet at the point a provider's `useMemo` runs.
   *
   * `activeSite` rides the hub URL's own query string, not the `X-Ago-Active-Site` header - a
   * browser cannot attach a custom header to a WebSocket upgrade, the same constraint that already
   * puts the bearer token in the query string instead of an `Authorization` header
   * (`accessTokenFactory` above; server-side, `AuthenticationSetup.HubTokenFromQueryString`).
   * `OperatorIdentityClaimsTransformation.ActiveSiteQueryParameterName` names the parameter
   * server-side as `"activeSite"`, the identical spelling `operatorConnection.ts` already uses for
   * `ago-chat`'s own hub.
   */
  private ensureConnection(): signalR.HubConnection {
    if (this.connection !== null) {
      return this.connection;
    }

    if (config.calendarApiBaseUrl === null) {
      // The provider (CalendarOperatorConnectionProvider) is the one place that decides whether to
      // ever call start() at all - it already gates on config.calendarApiBaseUrl !== null, the same
      // guard every calendar screen in this console uses. Reaching here regardless is a caller
      // bypassing that gate, not a state this class should silently paper over.
      throw new Error("CalendarOperatorConnection: calendarApiBaseUrl is not configured.");
    }

    const activeSiteId = getActiveSiteId();
    const hubUrl = activeSiteId
      ? `${config.calendarApiBaseUrl}/hubs/operator?activeSite=${encodeURIComponent(activeSiteId)}`
      : `${config.calendarApiBaseUrl}/hubs/operator`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: this.accessTokenFactory,
        // operatorConnection.ts's own remarks: this console never uses cookies, identity travels
        // entirely through the bearer token, and @microsoft/signalr defaults to withCredentials: true.
        withCredentials: false,
      })
      // `5-14`'s own reasoning, restated: WebSocketTransport logs the negotiated URL - which, after
      // this connection appends `access_token=`, is a live operator JWT - at exactly Information.
      // Warning is the lowest level that suppresses that line while keeping the diagnostics worth
      // having (HTTP errors, timeouts, an unhandled server->client method name).
      .configureLogging(signalR.LogLevel.Warning)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          jitteredDelayMs(context.previousRetryCount + 1, defaultBackoffOptions),
      })
      .build();

    connection.on("PendingBookingsChanged", (dto: PendingBookingsChangedDto) =>
      this.pendingBookingsChangedListener?.(dto),
    );
    connection.onreconnecting(() => this.stateListener?.("reconnecting"));
    connection.onreconnected(() => this.stateListener?.("connected"));
    connection.onclose(() => this.stateListener?.("disconnected"));

    this.connection = connection;
    return connection;
  }

  onStateChange(listener: (state: CalendarConnectionState) => void): void {
    this.stateListener = listener;
  }

  /** The one push this hub ever sends - see this class's own doc comment for why there is no
   * per-message dedup or replay-on-reconnect the way `operatorConnection.ts` needs for a
   * conversation's own message stream: a caller may act on this any number of times, including a
   * spurious extra one after a reconnect, with the identical correct result (re-read the queue). */
  onPendingBookingsChanged(listener: (dto: PendingBookingsChangedDto) => void): void {
    this.pendingBookingsChangedListener = listener;
  }

  get state(): CalendarConnectionState {
    if (this.connection === null) {
      return "disconnected";
    }

    switch (this.connection.state) {
      case signalR.HubConnectionState.Connected:
        return "connected";
      case signalR.HubConnectionState.Reconnecting:
        return "reconnecting";
      case signalR.HubConnectionState.Connecting:
        return "connecting";
      default:
        return "disconnected";
    }
  }

  async start(): Promise<void> {
    this.stateListener?.("connecting");
    const connection = this.ensureConnection();
    await connection.start();
    this.stateListener?.("connected");
  }

  async stop(): Promise<void> {
    if (this.connection === null) {
      return;
    }

    await this.connection.stop();
  }
}
