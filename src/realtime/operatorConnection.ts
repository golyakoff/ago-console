import * as signalR from "@microsoft/signalr";
import { config } from "../config.js";
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
 */
export class OperatorConnection {
  private readonly connection: signalR.HubConnection;
  private seenMessageIds = new SeenMessageIds();
  private messageListener: ((message: MessageDto) => void) | null = null;
  private anyMessageListener: ((message: MessageDto) => void) | null = null;
  private seenAnywhereMessageIds = new SeenMessageIds();
  private stateListener: ((state: ConnectionState) => void) | null = null;
  private conversationAssignedListener: ((dto: ConversationAssignedDto) => void) | null = null;
  private reconnectHintListener: ((hint: ReconnectHint) => void) | null = null;
  private conversationId: string | null = null;
  private sequenceTracker = new SequenceTracker();

  constructor(accessToken: string) {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${config.apiBaseUrl}/hubs/operator`, {
        accessTokenFactory: () => accessToken,
        // api-design.md's "Shipped in `5-09`" note names this exact gotcha for "any other SignalR
        // client this project adds": `@microsoft/signalr` defaults to `withCredentials: true`, and
        // the console never uses cookies (identity travels entirely through this bearer token,
        // adr/0022/adr/0023).
        withCredentials: false,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          jitteredDelayMs(context.previousRetryCount + 1, defaultBackoffOptions),
      })
      .build();

    this.connection.on("MessageReceived", (dto: MessageDto) => {
      // Two listeners, deliberately in this order and deliberately independent: the unfiltered one
      // feeds the workspace's attention state for every assigned conversation, the filtered one
      // feeds whichever thread is on screen. See `onAnyMessage` for why the split exists.
      if (this.anyMessageListener !== null && this.seenAnywhereMessageIds.markSeen(dto.id)) {
        this.anyMessageListener(dto);
      }

      this.handleIncoming(dto);
    });
    this.connection.on("ConversationAssigned", (dto: ConversationAssignedDto) =>
      this.conversationAssignedListener?.(dto),
    );
    // realtime.md: the server may ask a client to reconnect on its own schedule before a draining
    // node shuts down - informational here (see `types.ts`'s `ReconnectHint` doc comment for the
    // doc/code drift this corrects), since the drain sequence's own subsequent disconnect is what
    // actually triggers `onreconnecting`/`onreconnected` below.
    this.connection.on("Reconnect", (hint: ReconnectHint) => this.reconnectHintListener?.(hint));

    this.connection.onreconnecting(() => this.stateListener?.("reconnecting"));
    this.connection.onreconnected(() => void this.resumeAfterReconnect());
    this.connection.onclose(() => this.stateListener?.("disconnected"));
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
    await this.connection.start();
    this.stateListener?.("connected");
  }

  async stop(): Promise<void> {
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
    this.conversationId = conversationId;
    this.sequenceTracker = new SequenceTracker();
    this.seenMessageIds = new SeenMessageIds();

    const result = await this.connection.invoke<JoinConversationResult>("JoinConversationAsync", conversationId, null);
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
   * job to render it right now. */
  leaveConversation(): void {
    this.conversationId = null;
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
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new NotConnectedError();
    }

    try {
      return await this.connection.invoke<number>("SendMessageAsync", conversationId, body, attachmentId, clientMessageId);
    } catch (error) {
      if (this.connection.state !== signalR.HubConnectionState.Connected) {
        throw new SendOutcomeUnknownError(error);
      }

      throw error;
    }
  }

  async loadOlderHistory(conversationId: string, beforeSequence: number, pageSize: number): Promise<HistoryPage> {
    const page = await this.connection.invoke<HistoryPage>("GetHistoryAsync", conversationId, beforeSequence, pageSize);
    for (const message of page.messages) {
      this.seenMessageIds.markSeen(message.id);
    }

    return page;
  }

  /** `5-07`: a snapshot, not a subscription - see `GetVisitorPresenceHandler`'s own remarks
   * (`ago-chat`) for why a client re-call is the right shape here rather than a push. */
  async getVisitorPresence(conversationId: string): Promise<boolean> {
    return this.connection.invoke<boolean>("GetVisitorPresenceAsync", conversationId);
  }

  private async resumeAfterReconnect(): Promise<void> {
    if (this.conversationId === null) {
      this.stateListener?.("connected");
      return;
    }

    const lastKnownSequence = this.sequenceTracker.lastKnownSequence;
    const result = await this.connection.invoke<JoinConversationResult>(
      "JoinConversationAsync",
      this.conversationId,
      lastKnownSequence ?? undefined,
    );
    for (const message of result.messages) {
      this.handleIncoming(message);
    }

    this.stateListener?.("connected");
  }

  private handleIncoming(dto: MessageDto): void {
    // See this class's own doc comment: a push for a conversation other than the one currently open
    // is real (the operator is still assigned to it) but not this view's to render.
    if (dto.conversationId !== null && dto.conversationId !== undefined && dto.conversationId !== this.conversationId) {
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
