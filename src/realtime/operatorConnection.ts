import * as signalR from "@microsoft/signalr";
import { config } from "../config.js";
import { getActiveSiteId } from "../api/activeSite.js";
import { defaultBackoffOptions, jitteredDelayMs } from "./protocol/backoff.js";
import { SeenMessageIds } from "./protocol/dedup.js";
import { SequenceTracker } from "./protocol/sequence.js";
import type {
  ConversationAssignedDto,
  HistoryPage,
  JoinConversationResult,
  MessageDto,
  ReconnectHint,
} from "./protocol/types.js";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

/** Thrown by `sendMessage` when nothing was sent to the server at all - safe for a caller to retry
 * on its own once the connection reports "connected" again, with a *new* `clientMessageId` (no send
 * was ever attempted, so there is nothing to deduplicate against). */
export class NotConnectedError extends Error {
  constructor() {
    super("Not connected.");
    this.name = "NotConnectedError";
  }
}

/**
 * Thrown when an invoke was actually in flight and the outcome is unknown. Unlike `ago-widget`'s
 * identically-named error (written before `clientMessageId` was wired up server-side), retrying
 * *is* now safe here - `5-07`'s whole point - as long as the retry reuses the exact same
 * `clientMessageId` the failed attempt used (`sendMessage`'s own `clientMessageId` parameter exists
 * precisely so a caller can do that).
 */
export class SendOutcomeUnknownError extends Error {
  constructor(cause: unknown) {
    super("Send outcome unknown - the connection may have dropped mid-request. Retry with the same clientMessageId.");
    this.name = "SendOutcomeUnknownError";
    this.cause = cause;
  }
}

/**
 * Wraps `@microsoft/signalr`'s `HubConnection` with exactly the behaviour realtime.md's Client
 * protocol section requires: resume by `lastKnownSequence` for whichever conversation is currently
 * open, full-jitter reconnect backoff, dedup of the sender's own echoed-back message, and
 * `clientMessageId`-based retry-dedup on send. One instance is shared for the operator's whole
 * session (`OperatorConnectionProvider`) rather than recreated per page, so switching between the
 * queue view and a conversation view never drops and reopens the underlying SignalR connection.
 *
 * Deliberately mirrors `ago-widget/src/connection.ts`'s `VisitorConnection` shape - the console is
 * solving the identical protocol problem independently (per this backlog item's own framing), so it
 * reuses the same already-reviewed design rather than inventing a new one. The one structural
 * difference: an operator can be *assigned* several conversations at once (their own capacity) even
 * though this console only ever displays one at a time (`5-07`'s scope) - `MessageDto.conversationId`
 * (a `5-07` addition to the wire contract, `Ago.Chat.Contracts`) is what lets `handleIncoming` below
 * tell a push meant for the currently-open conversation from one that is not, since the hub delivers
 * to this connection by *principal*, not by which conversation the console happens to have open.
 *
 * ## The subscription record (`5-16`)
 *
 * `subscribedConversationId` plus `sequenceTracker` are this connection's **record of what it is
 * subscribed to server-side**, and `resumeSubscription` is the single thing that replays that record
 * onto the wire. Everything that brings this connection into a connected state goes through it -
 * `start()` and SignalR's own `onreconnected` alike - because a hub connection that comes back up
 * has *no* server-side group membership from its previous life, and the screen carries on rendering
 * the conversation regardless. That gap is silent by construction: nothing fails, messages simply
 * stop arriving.
 *
 * `5-16` was a live instance of exactly that, from the one direction not covered: an access-token
 * renewal used to construct a whole new `OperatorConnection` (the token rides in the negotiate URL),
 * whose record was empty, so nothing re-joined and `onreconnected` never fired because it was not a
 * reconnect. The token no longer rebuilds anything (`OperatorConnectionProvider`), and replay is
 * keyed on "this connection became connected" rather than on any one cause of it, so the next way
 * this connection comes back up - whatever it is - is covered without a second bolt-on.
 */
export class OperatorConnection {
  // `13-07`/`adr/0068`: not `readonly`, and not built in the constructor - see `ensureConnection`
  // below for why. Still built at most once per `OperatorConnection` instance; every existing
  // stop()-then-start() restart pattern this class already supports reuses the same built object,
  // unchanged.
  private connection: signalR.HubConnection | null = null;
  private readonly accessTokenFactory: () => string;
  private seenMessageIds = new SeenMessageIds();
  private messageListener: ((message: MessageDto) => void) | null = null;
  private anyMessageListener: ((message: MessageDto) => void) | null = null;
  private seenAnywhereMessageIds = new SeenMessageIds();
  private stateListener: ((state: ConnectionState) => void) | null = null;
  private conversationAssignedListener: ((dto: ConversationAssignedDto) => void) | null = null;
  private reconnectHintListener: ((hint: ReconnectHint) => void) | null = null;
  private subscribedConversationId: string | null = null;
  private sequenceTracker = new SequenceTracker();

  /**
   * `accessTokenFactory` is a factory, not a token, and is called on every connect and every
   * reconnect attempt - which is the whole reason `@microsoft/signalr` takes one. `5-16` found it
   * closing over a captured string here: survivable only because a renewal rebuilt the entire
   * object, which is the defect that item exists to remove. Reading the current token at call time
   * is what makes a reconnect after a long idle re-negotiate with a token that is still valid.
   */
  constructor(accessTokenFactory: () => string) {
    this.accessTokenFactory = accessTokenFactory;
  }

  /**
   * `13-07`/`adr/0068`: builds the underlying `signalR.HubConnection` on first use rather than in
   * the constructor - the one change this item needed here. The constructor runs inside
   * `OperatorConnectionProvider`'s `useMemo(..., [])`, at first render, unconditionally; the
   * active-site signal (`getActiveSiteId()` below) is not reliably known that early for a
   * multi-tenancy identity (`PermissionsProvider`'s own tenancy fetch is still async at that point).
   * Reading it here instead - the first time `start()` actually runs a connect - means it is read at
   * the one moment this class is guaranteed a settled answer, without this class needing to know
   * *why* (`OperatorConnectionProvider`'s own gate on `usePermissions().tenancies` is what makes
   * "first `start()`" also "after resolution" in practice).
   *
   * A header (`X-Ago-Active-Site`, what every REST call in this codebase carries via
   * `withActiveSiteHeader`) does not reliably reach a WebSocket upgrade in a browser - the identical
   * constraint that already put this app's own bearer token in the query string instead of an
   * `Authorization` header for this exact connection (`accessTokenFactory` below; server-side,
   * `Program.cs`'s own `HubTokenFromQueryString`) - so this appends the same kind of query-string
   * parameter (`OperatorIdentityClaimsTransformation.ActiveSiteQueryParameterName` server-side,
   * `"activeSite"`), verified against a real hub connection in `ago-chat`'s own
   * `ActiveSiteHubResolutionTests`. Omitted entirely when no active site is known (a single-tenant
   * operator) - the resolver's existing no-signal fallback already handles that correctly.
   *
   * Built at most once: every existing `stop()`-then-`start()` restart this class already supports
   * (`5-16`'s own subscription-replay tests) reuses the same built object unchanged - only the very
   * first `start()` a given instance ever sees reaches the `this.connection === null` branch.
   */
  private ensureConnection(): signalR.HubConnection {
    if (this.connection !== null) {
      return this.connection;
    }

    const activeSiteId = getActiveSiteId();
    const hubUrl = activeSiteId
      ? `${config.apiBaseUrl}/hubs/operator?activeSite=${encodeURIComponent(activeSiteId)}`
      : `${config.apiBaseUrl}/hubs/operator`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: this.accessTokenFactory,
        // api-design.md's "Shipped in `5-09`" note names this exact gotcha for "any other SignalR
        // client this project adds": `@microsoft/signalr` defaults to `withCredentials: true`, and
        // the console never uses cookies (identity travels entirely through this bearer token,
        // adr/0022/adr/0023).
        withCredentials: false,
      })
      // `5-14`: without this, `@microsoft/signalr`'s default logger is `ConsoleLogger(Information)`,
      // and `WebSocketTransport` logs "WebSocket connected to {url}" at exactly `Information` - after
      // it has appended `access_token=` to that url. The result is a live, unexpired operator JWT in
      // plain text in devtools on every connect, which `coding-style.md` bans outright ("Never log
      // message bodies, tokens, presigned URLs...").
      //
      // `Warning` rather than `Error`/`None` because it is the *lowest* level that suppresses that
      // line while still surfacing the diagnostics worth having: HTTP request errors and timeouts,
      // the page-freeze warning that predicts a dropped connection, and an unhandled server->client
      // method name.
      //
      // Deliberately not conditional on `import.meta.env.DEV`. The tempting shape - verbose locally,
      // quiet in production - cannot work here: the token-bearing line sits at `Information`, which
      // is *above* `Debug` and `Trace` on this library's ladder, so every level verbose enough to be
      // worth switching to also prints the token. There is no dev setting that is both more
      // informative and token-free, and the token is just as real locally as it is in production. A
      // developer who genuinely needs transport-level tracing edits this one line for the duration of
      // that debugging session - a deliberate act, not a default that ships.
      .configureLogging(signalR.LogLevel.Warning)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          jitteredDelayMs(context.previousRetryCount + 1, defaultBackoffOptions),
      })
      .build();

    connection.on("MessageReceived", (dto: MessageDto) => {
      // Two listeners, deliberately in this order and deliberately independent: the unfiltered one
      // feeds the workspace's attention state for every assigned conversation, the filtered one
      // feeds whichever thread is on screen. See `onAnyMessage` for why the split exists.
      if (this.anyMessageListener !== null && this.seenAnywhereMessageIds.markSeen(dto.id)) {
        this.anyMessageListener(dto);
      }

      this.handleIncoming(dto);
    });
    connection.on("ConversationAssigned", (dto: ConversationAssignedDto) => this.conversationAssignedListener?.(dto));
    // realtime.md: the server may ask a client to reconnect on its own schedule before a draining
    // node shuts down - informational here (see `types.ts`'s `ReconnectHint` doc comment for the
    // doc/code drift this corrects), since the drain sequence's own subsequent disconnect is what
    // actually triggers `onreconnecting`/`onreconnected` below.
    connection.on("Reconnect", (hint: ReconnectHint) => this.reconnectHintListener?.(hint));

    connection.onreconnecting(() => this.stateListener?.("reconnecting"));
    connection.onreconnected(() => void this.resumeAfterReconnect());
    connection.onclose(() => this.stateListener?.("disconnected"));

    this.connection = connection;
    return connection;
  }

  onMessage(listener: (message: MessageDto) => void): void {
    this.messageListener = listener;
  }

  /**
   * `11-06`: every `MessageReceived` push this connection receives, for *any* conversation this
   * operator is assigned - not just the one currently on screen.
   *
   * `onMessage` above cannot serve this: `handleIncoming` deliberately drops a push whose
   * `conversationId` is not the open one, which is correct for rendering a thread and is exactly
   * why the console previously could not know that a second conversation had a new visitor message
   * in it. The workspace's unread badges and its document-title count are that knowledge, so this
   * item adds the unfiltered listener rather than weakening the filtered one - the two answer
   * different questions and the split keeps `ConversationPage` unable to render a message that does
   * not belong to it.
   *
   * Deduplicated on its own `SeenMessageIds` instance, separate from the per-conversation one
   * `joinConversation` resets: the sender's own message arrives twice by design (local echo plus
   * fan-out, `dedup.ts`), and a badge that counted both would be wrong twice over.
   */
  onAnyMessage(listener: (message: MessageDto) => void): void {
    this.anyMessageListener = listener;
  }

  onStateChange(listener: (state: ConnectionState) => void): void {
    this.stateListener = listener;
  }

  onConversationAssigned(listener: (dto: ConversationAssignedDto) => void): void {
    this.conversationAssignedListener = listener;
  }

  onReconnectHint(listener: (hint: ReconnectHint) => void): void {
    this.reconnectHintListener = listener;
  }

  get state(): ConnectionState {
    if (this.connection === null) {
      // Never started yet - the same "not connected" answer a built-but-not-started signalR
      // connection would give, so a caller reading this before the first `start()` sees nothing
      // different from today.
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

  /**
   * `5-16`: replays the subscription record after the socket is up, before announcing "connected" -
   * a no-op on a first start (nothing is subscribed yet) and the whole point on any later one. A
   * `start()` on a connection that already has an open conversation is not hypothetical: `stop()`
   * followed by `start()` is how this class is restarted, and `@microsoft/signalr` gives that
   * restarted `HubConnection` none of the server-side groups its previous life had.
   *
   * Rejecting rather than swallowing a failed replay is deliberate: the caller
   * (`OperatorConnectionProvider`) already reports a failed `start()` as "disconnected", which is
   * the honest answer for a connection whose thread is not actually live. Swallowing it would
   * reproduce this item's own defect - a healthy-looking badge over a deaf conversation.
   */
  async start(): Promise<void> {
    this.stateListener?.("connecting");
    const connection = this.ensureConnection();
    await connection.start();
    await this.resumeSubscription();
    this.stateListener?.("connected");
  }

  async stop(): Promise<void> {
    if (this.connection === null) {
      // Nothing was ever started - a no-op, not an error; symmetrical with `state`'s own answer for
      // the same case.
      return;
    }

    await this.connection.stop();
  }

  /**
   * Opens (or resumes, on a reconnect) the given conversation - `OperatorHub.JoinConversationAsync`
   * doubles as the operator's own claim primitive when the conversation is still `Waiting`
   * (`realtime.md`'s "Shipped in `5-07`" note), which is exactly why this console never calls it for
   * a conversation the queue view lists as `Waiting`: `docs/vision.md`'s assignment model is
   * automatic-only, and calling this on a still-waiting conversation would silently claim it by
   * hand. Callers must only pass the id of a conversation the queue already reports as
   * `AssignedToMe`.
   */
  async joinConversation(conversationId: string): Promise<JoinConversationResult> {
    this.subscribedConversationId = conversationId;
    this.sequenceTracker = new SequenceTracker();
    this.seenMessageIds = new SeenMessageIds();

    const result = await this.requireConnection().invoke<JoinConversationResult>(
      "JoinConversationAsync",
      conversationId,
      null,
    );
    for (const message of result.messages) {
      this.rememberSequence(message);
      this.seenMessageIds.markSeen(message.id);
    }

    return result;
  }

  /** Stops routing incoming pushes to the message listener - called when the console navigates away
   * from a conversation view, so a push for a conversation no longer on screen is not mistaken for
   * one that is. Does not leave the hub connection itself; `MessageReceived` for this conversation
   * may still arrive (the operator is still assigned to it), it is simply not this console page's
   * job to render it right now. Clearing the subscription record is also what stops a later
   * reconnect from re-joining a conversation the operator is no longer looking at (`5-16`). */
  leaveConversation(): void {
    this.subscribedConversationId = null;
  }

  /**
   * `NotConnectedError` is safe to retry once the connection reports "connected" again, with a fresh
   * `clientMessageId`. `SendOutcomeUnknownError` is retry-safe too, but only with the *same*
   * `clientMessageId` passed here - `5-07`'s whole point, wired all the way through to
   * `Conversation.AddOperatorMessage`'s in-memory dedup check server-side.
   *
   * `attachmentId` is `5-08`'s own addition - `OperatorHub.SendMessageAsync` has accepted it since
   * `5-07` (appended before `clientMessageId`, see that method's own remarks on argument order), this
   * console simply never had a caller that had already uploaded and confirmed one until now.
   */
  async sendMessage(conversationId: string, body: string, clientMessageId: string, attachmentId: string | null = null): Promise<number> {
    if (this.connection?.state !== signalR.HubConnectionState.Connected) {
      throw new NotConnectedError();
    }

    const connection = this.connection;
    try {
      return await connection.invoke<number>("SendMessageAsync", conversationId, body, attachmentId, clientMessageId);
    } catch (error) {
      if (connection.state !== signalR.HubConnectionState.Connected) {
        throw new SendOutcomeUnknownError(error);
      }

      throw error;
    }
  }

  async loadOlderHistory(conversationId: string, beforeSequence: number, pageSize: number): Promise<HistoryPage> {
    const page = await this.requireConnection().invoke<HistoryPage>(
      "GetHistoryAsync",
      conversationId,
      beforeSequence,
      pageSize,
    );
    for (const message of page.messages) {
      this.seenMessageIds.markSeen(message.id);
    }

    return page;
  }

  /** `5-07`: a snapshot, not a subscription - see `GetVisitorPresenceHandler`'s own remarks
   * (`ago-chat`) for why a client re-call is the right shape here rather than a push. */
  async getVisitorPresence(conversationId: string): Promise<boolean> {
    return this.requireConnection().invoke<boolean>("GetVisitorPresenceAsync", conversationId);
  }

  /** Every caller below only ever runs once a connection is known to exist - `start()` builds one
   * before doing anything else, and every other caller runs from inside code paths that only
   * activate after `start()` has succeeded (a "connected" state, or `onreconnected`/`resumeSubscription`,
   * which SignalR can only fire on a connection that already exists). A `null` here would mean one of
   * those invariants broke, which is a real bug worth a thrown error, not a silently swallowed no-op. */
  private requireConnection(): signalR.HubConnection {
    if (this.connection === null) {
      throw new Error("OperatorConnection: no connection has been started yet.");
    }

    return this.connection;
  }

  /**
   * SignalR's own reconnect finished. Same replay as `start()`'s, then the state announcement -
   * split out only because this path owns telling the provider the link is healthy again, whereas
   * `start()` announces its own.
   */
  private async resumeAfterReconnect(): Promise<void> {
    try {
      await this.resumeSubscription();
    } catch (error) {
      // Before `5-16` this rejection was unhandled and the badge simply stayed on "reconnecting"
      // forever. Saying "disconnected" out loud is the same judgement `start()`'s doc comment
      // records: the socket is up, but the conversation on screen is not receiving anything, and a
      // badge that admits it is the only channel that can tell the operator so.
      console.error("Failed to resume the open conversation after reconnecting", error);
      this.stateListener?.("disconnected");
      return;
    }

    this.stateListener?.("connected");
  }

  /**
   * The one replay of the subscription record - see this class's own doc comment. Deliberately
   * *not* a fresh `joinConversation`: this asks for the delta after `lastKnownSequence` (`3-03`'s
   * resume protocol) and feeds it through `handleIncoming`, so a resume appends what was missed
   * rather than discarding and re-rendering the whole thread.
   */
  private async resumeSubscription(): Promise<void> {
    const conversationId = this.subscribedConversationId;
    if (conversationId === null) {
      return;
    }

    const lastKnownSequence = this.sequenceTracker.lastKnownSequence;
    const result = await this.requireConnection().invoke<JoinConversationResult>(
      "JoinConversationAsync",
      conversationId,
      lastKnownSequence ?? undefined,
    );
    for (const message of result.messages) {
      this.handleIncoming(message);
    }
  }

  private handleIncoming(dto: MessageDto): void {
    // See this class's own doc comment: a push for a conversation other than the one currently open
    // is real (the operator is still assigned to it) but not this view's to render.
    if (
      dto.conversationId !== null &&
      dto.conversationId !== undefined &&
      dto.conversationId !== this.subscribedConversationId
    ) {
      return;
    }

    this.rememberSequence(dto);
    if (this.seenMessageIds.markSeen(dto.id)) {
      this.messageListener?.(dto);
    }
  }

  // No persistent storage of the last-known sequence across a full page reload (unlike the widget's
  // own `localStorage`-backed tracker) - `5-06`'s own scope note on `automaticSilentRenew` already
  // applies the same reasoning here: a console session is expected to live only as long as the
  // connection does, not survive a hard reload, so there is nothing to seed `SequenceTracker` from
  // on construction - `observe`'s return value simply has no second consumer here the way the
  // widget's own `rememberSequence` uses it to decide whether a `localStorage` write is needed.
  private rememberSequence(message: MessageDto): void {
    this.sequenceTracker.observe(message.sequence);
  }
}
