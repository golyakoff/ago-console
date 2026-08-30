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

/**
 * `18-01`: `Ago.Chat.Contracts.ConversationSearchResultDto` - one full-text search hit. `MatchedBody`
 * is the complete message body, not a snippet or a highlighted excerpt - `SearchConversationsHandler`'s
 * own remarks are explicit that no highlight is computed server-side, so this console does not attempt
 * to reconstruct one client-side either (a `plainto_tsquery` match is a stemmed token match, not a
 * literal substring, so any client-side "find the phrase in the body" highlight would frequently point
 * at the wrong word or nothing at all). `Sequence` is what makes "open this hit at the right position"
 * buildable at all - see `conversationsApi.ts#searchConversations`'s own doc comment for how the console
 * uses it and where that stops being possible.
 */
export interface ConversationSearchResultDto {
  conversationId: string;
  messageId: string;
  sequence: number;
  matchedBody: string;
  authorKind: "Visitor" | "Operator" | "System";
  createdAt: string;
  conversationState: "Waiting" | "Assigned" | "Closed";
}

/**
 * `18-01`: `Ago.Chat.Contracts.SearchConversationsResponse` - `GET /api/v1/conversations/search`'s
 * body. `searchedFrom`/`searchedTo` are the range the server actually used, always present even when
 * the caller sent neither and the handler defaulted them (`SearchConversationsHandler`'s own "the bound
 * decision, made here and nowhere else") - the console reads these back rather than ever assuming its
 * own request echoes the effective range, which is this item's own Done-when ("the bound is visible,
 * not silent").
 */
export interface SearchConversationsResponse {
  results: ConversationSearchResultDto[];
  nextBeforeMessageId: string | null;
  searchedFrom: string;
  searchedTo: string;
}

/**
 * `18-08`: `Ago.Chat.Contracts.OperatorAnalyticsBucketDto` - one bucket's worth of the three numbers
 * the analytics panel exists to show. `averageFirstResponseSeconds` is `null` when nothing in this
 * bucket ever received an operator reply - never `0` and never inflated by the conversations counted
 * in `missedCount`, which are excluded from the average entirely
 * (`IOperatorAnalyticsReadStore`'s own remarks, `ago-chat`).
 */
export interface OperatorAnalyticsBucketDto {
  conversationCount: number;
  averageFirstResponseSeconds: number | null;
  missedCount: number;
}

/**
 * `18-08`: `Ago.Chat.Contracts.OperatorAnalyticsChannelBucketDto` - one channel's bucket, labelled
 * with `Ago.Chat.Domain.ChannelKind`'s own member name (`"Max"`/`"Sms"`/`"Telegram"`/`"WhatsApp"`) or
 * the literal `"Widget"` for a visitor with no external channel identity at all.
 */
export interface OperatorAnalyticsChannelBucketDto {
  channel: string;
  bucket: OperatorAnalyticsBucketDto;
}

/**
 * `18-09`: `Ago.Chat.Contracts.OperatorAnalyticsOperatorBucketDto` - one operator's bucket.
 * `operatorId` is the operator this window's numbers attribute to: whoever replied first, or (only for
 * a conversation nobody ever replied to) whoever was holding it when it closed unanswered - never
 * whoever a conversation was later transferred to (`IOperatorAnalyticsReadStore`'s own remarks,
 * `ago-chat`). The console has no operator display name to render (`Ago.Chat.Domain.Operator` carries
 * none), so this is the raw id - `OperatorAnalyticsPage` renders it the same truncated-mono way
 * `AdminConversationsPage`'s own assigned-operator column already does.
 */
export interface OperatorAnalyticsOperatorBucketDto {
  operatorId: string;
  bucket: OperatorAnalyticsBucketDto;
}

/**
 * `18-08`: `Ago.Chat.Contracts.OperatorAnalyticsResponse` - `GET /api/v1/conversations/analytics`'s
 * body. `from`/`to` are the range the server actually used, always present even when the caller sent
 * neither and the handler defaulted them (`GetOperatorAnalyticsForSiteHandler`'s own default window) -
 * the same "the bound is visible, not silent" shape `SearchConversationsResponse.searchedFrom`/
 * `searchedTo` already establishes for `18-01`. `18-09` adds `byOperator`, the identical shape as
 * `byChannel` with a different dimension.
 */
export interface OperatorAnalyticsResponse {
  from: string;
  to: string;
  overall: OperatorAnalyticsBucketDto;
  byChannel: OperatorAnalyticsChannelBucketDto[];
  byOperator: OperatorAnalyticsOperatorBucketDto[];
}
