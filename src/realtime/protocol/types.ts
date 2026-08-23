/**
 * Wire shapes mirroring `Ago.Chat.Contracts` (api-design.md: "payload shapes live in
 * Ago.Chat.Contracts and are versioned with the same additive-only rule as integration events").
 * This file has no logic - it exists so the rest of the console never guesses field names, the same
 * role `ago-widget/src/protocol/types.ts` plays for the widget.
 */

export interface MessageDto {
  id: string;
  sequence: number;
  authorKind: "Visitor" | "Operator";
  authorId: string;
  body: string;
  createdAt: string;
  attachmentId?: string | null;
  /** `5-07`: additive, optional - `null`/absent for any message sent before this shipped. See
   * `dedup.ts`'s `newClientMessageId` doc comment for what this is used for. */
  clientMessageId?: string | null;
  /** `5-07`: also additive - see `MessageDto.cs`'s own doc comment (`Ago.Chat.Contracts`) for why
   * this turned out to be load-bearing, not cosmetic: without it, `operatorConnection.ts`'s
   * `handleIncoming` cannot tell a push meant for the currently-open conversation from one that
   * belongs to another conversation this operator is also assigned to. */
  conversationId?: string | null;
}

export interface HistoryPage {
  messages: MessageDto[];
  nextBeforeSequence: number | null;
}

/** `OperatorHub.JoinConversationAsync`'s return shape - same `HistoryPage` type
 * `GetHistoryAsync` returns, per the hub's own doc comment ("one handler, two entry points"). */
export type JoinConversationResult = HistoryPage;

/** `5-07`: `Ago.Chat.Contracts.ConversationAssignedDto` - pushed to the operator's own connection as
 * `"ConversationAssigned"` whenever `4-02`'s automatic engine hands them a new conversation. */
export interface ConversationAssignedDto {
  conversationId: string;
  operatorId: string;
  assignedAt: string;
}

/**
 * `5-07`: `Ago.Chat.Contracts.ConversationSummaryDto` - one row of the queue view.
 * `operatorId` is a `5-08` addition, additive/optional per `ConversationSummaryDto.cs`'s own doc
 * comment - `null`/absent for `Waiting` rows and for any server that predates this field. The queue
 * view's own two lists never needed it; the admin's site-wide list (`AdminConversationsPage`) is the
 * first caller that does.
 */
export interface ConversationSummaryDto {
  conversationId: string;
  visitorId: string;
  state: "Waiting" | "Assigned" | "Closed";
  createdAt: string;
  operatorUnreadCount: number;
  operatorId?: string | null;
}

/** `5-07`: `Ago.Chat.Contracts.OperatorQueueResponse` - `GET /api/v1/conversations/queue`'s body. */
export interface OperatorQueueResponse {
  waiting: ConversationSummaryDto[];
  assignedToMe: ConversationSummaryDto[];
}

/** `5-08`: `Ago.Chat.Contracts.AllConversationsForSiteResponse` -
 * `GET /api/v1/conversations/all`'s body, the admin/supervisor site-wide list. */
export interface AllConversationsForSiteResponse {
  conversations: ConversationSummaryDto[];
  nextBeforeId: string | null;
}

/** The server's graceful-shutdown hint (`ConnectionDrainCoordinator`, `Ago.Platform.Realtime`) -
 * pushed as a generic `"Reconnect"` event, not a hub method the client calls (realtime.md's own
 * "Shipped in `5-07`" note corrects an earlier doc/code drift here - see that note for detail). */
export interface ReconnectHint {
  after: string;
}
