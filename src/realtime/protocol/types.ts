/**
 * Wire shapes mirroring `Ago.Chat.Contracts` (api-design.md: "payload shapes live in
 * Ago.Chat.Contracts and are versioned with the same additive-only rule as integration events").
 * This file has no logic - it exists so the rest of the console never guesses field names, the same
 * role `ago-widget/src/protocol/types.ts` plays for the widget.
 */

export interface MessageDto {
  id: string;
  sequence: number;
  /** `14-04`: `"System"` is a message AGO Chat authored on the tenant's behalf - today the offline
   * auto-reply. Additive, per api-design.md's versioning rule. The thread renders it on the incoming
   * side alongside the visitor, which is where a message nobody on this side wrote belongs. */
  authorKind: "Visitor" | "Operator" | "System";
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

/**
 * `18-07`: `Ago.Chat.Contracts.VisitorHistoryConversationDto` - one row of a channel-identified
 * visitor's prior-conversation panel. `closedAt` is `null` both for a conversation still open and
 * for one closed before `Conversation.ClosedAt` existed server-side - `state` already distinguishes
 * the first case, and the wire cannot and need not distinguish the second from it.
 */
export interface VisitorHistoryConversationDto {
  conversationId: string;
  state: "Waiting" | "Assigned" | "Closed";
  startedAt: string;
  closedAt: string | null;
  previewBody: string | null;
  previewAuthorKind: "Visitor" | "Operator" | "System" | null;
  previewCreatedAt: string | null;
}

/**
 * `18-07`: `Ago.Chat.Contracts.VisitorHistoryResponse` -
 * `GET /api/v1/conversations/{id}/visitor-history`'s body. `hasChannelIdentity` is the gate: `false`
 * means this visitor has no channel identity at all (an ordinary widget visitor, `14-01`'s model) and
 * the console must render no panel whatsoever - not an empty-state one, which would imply a returning
 * widget visitor is a case that can occur. See `VisitorHistoryPanel`'s own doc comment.
 */
export interface VisitorHistoryResponse {
  hasChannelIdentity: boolean;
  conversations: VisitorHistoryConversationDto[];
  nextBeforeId: string | null;
}
