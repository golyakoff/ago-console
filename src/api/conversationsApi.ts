import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";
import type {
  AllConversationsForSiteResponse,
  BookingFlowReportResponse,
  ConversationOutcomeResponse,
  ConversionReportResponse,
  OperatorAnalyticsResponse,
  OperatorQueueResponse,
  SearchConversationsResponse,
  VisitorHistoryResponse,
} from "../realtime/protocol/types.js";
import type { ErasureCheckOutcome } from "../erasure/erasureCheck.js";

/** What `POST /api/v1/conversations/{id}/read` answers with: the conversation's unread state after
 * the write, so the console never has to guess that it became zero. */
export interface MarkConversationReadResult {
  operatorUnreadCount: number;
  operatorLastReadSequence: number;
}

/**
 * `5-07`: `GET /api/v1/conversations/queue` (`Ago.Chat.Api.Conversations.ConversationsEndpoints`,
 * an addition this item made to `ago-chat` - see that endpoint's own doc comment for why it exists:
 * nothing before this item let an operator learn "what's waiting, what's mine" on page load, only
 * the live `"ConversationAssigned"` push for whoever happened to be connected at the moment of
 * assignment). A plain `fetch`, not a hub call - this is an ordinary authenticated HTTP read, not
 * high-frequency or connection-scoped, so REST is the right shape (api-design.md), matching how
 * `AuthEndpoints`/`AttachmentEndpoints` are called rather than routed through a hub method.
 */
/** `18-04`: `tagId` narrows both `assignedToMe` and `waiting` to conversations carrying that tag -
 * `GetOperatorQueueHandler`'s own in-memory filter over its two already-small, unpaginated lists.
 * Omitted or `undefined` means unfiltered. */
export async function fetchOperatorQueue(accessToken: string, tagId?: string): Promise<OperatorQueueResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/queue`);
  if (tagId) {
    url.searchParams.set("tag", tagId);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load the queue: ${response.status}`);
  }

  return (await response.json()) as OperatorQueueResponse;
}

/**
 * `5-08`: `GET /api/v1/conversations/all` (`Ago.Chat.Api.Conversations.ConversationsEndpoints`, this
 * item's own addition) - the admin/supervisor site-wide list, gated server-side on
 * `site:configure` (`GetAllConversationsForSiteHandler`'s own remarks). Keyset-paginated like
 * `loadOlderHistory`; `beforeId` is the previous page's `nextBeforeId`, omitted for the first page.
 */
/** `18-04`: `tagId` is pushed into `GetAllConversationsForSiteHandler`'s own paginated read - see
 * that method's own remarks on why this filter is server-side, unlike the queue's in-memory one. */
export async function fetchAllConversationsForSite(
  accessToken: string,
  beforeId?: string,
  tagId?: string,
): Promise<AllConversationsForSiteResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/all`);
  if (beforeId) {
    url.searchParams.set("beforeId", beforeId);
  }
  if (tagId) {
    url.searchParams.set("tag", tagId);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load all conversations: ${response.status}`);
  }

  return (await response.json()) as AllConversationsForSiteResponse;
}

/**
 * `5-15`: `POST /api/v1/conversations/{id}/read` - the write that finally makes `operatorUnreadCount`
 * mean "messages you have not read" rather than "messages this conversation has ever received".
 *
 * `upToSequence` is the newest message the console actually has on screen, not a "clear it" flag.
 * That is the whole point of the endpoint's shape: a visitor message arriving in the same instant is
 * past that sequence, so the server still counts it (see `Conversation.MarkReadByOperator` in
 * `ago-chat`). Passing something the operator has not seen would quietly mute it.
 *
 * REST rather than a hub method even though the console holds an open connection - the endpoint's own
 * doc comment carries the argument: the failure modes (`403` for a conversation that is not yours,
 * `409` for a doubly-raced write) are real status codes here and would be indistinguishable strings
 * over SignalR, and this fires once per open plus a debounced call while one is on screen, which is
 * nowhere near hot enough to trade that away.
 */
export async function markConversationRead(
  accessToken: string,
  conversationId: string,
  upToSequence: number,
): Promise<MarkConversationReadResult> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/read`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ upToSequence }),
  });

  if (!response.ok) {
    throw new Error(`Failed to mark the conversation read: ${response.status}`);
  }

  return (await response.json()) as MarkConversationReadResult;
}

/**
 * `6-02`'s `POST /api/v1/conversations/{id}/close`, called for the first time.
 *
 * The endpoint has existed since Stage 6 and `6-09` made it the thing that hands an operator's
 * capacity claim back to `4-02`'s assignment engine. Nothing in this repository had ever invoked it -
 * which is the whole of `11-09`.
 *
 * <b>`204 No Content` on success</b>, so there is nothing to return. The console learns what changed
 * by re-reading the queue, which is also how the rail drops the row: a closed conversation leaves
 * `assignedToMe` entirely (`GetAssignedToOperatorAsync` filters on `State == Assigned`), so the
 * server's own view can never say "closed" about it - only "no longer here".
 *
 * <b>Throws `ApiProblemError`</b> (`api/problemDetails.ts`) rather than a bare `Error` like the reads above, because this
 * is the first call in this file whose caller has to branch on *which* failure it was - see
 * `workspace/closeOutcome.ts`, which is where that branching lives.
 */
export async function closeConversation(accessToken: string, conversationId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/close`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/**
 * `16-02`: `POST /api/v1/conversations/{id}/erase` - erasure on the visitor's own request, initiated
 * by the tenant (`16-02`'s own Scope: "the visitor has no account and no login - they ask the shop,
 * the shop acts"). `202 Accepted`, the same "a Worker job started, nothing is gone yet" contract
 * `sitesApi.ts#eraseSite` documents in full; `checkConversationErasure` below is this call's
 * completion poll.
 */
export async function eraseConversation(accessToken: string, conversationId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/erase`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 202) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/**
 * `16-02`'s completion poll for `eraseConversation` above - <b>and the one place this item's own
 * contract, as handed down, does not match this repository as it stands.</b>
 *
 * The contract names "the existing single-conversation admin-fetch endpoint" to poll until `404`,
 * on the assumption stated alongside it that "it already exists, since `AdminConversationsPage` has
 * to fetch individual conversations somehow." <b>It does not exist.</b> `fetchAllConversationsForSite`
 * above is the only admin read in this file, and it fetches the *whole* site's list - there is no
 * single-conversation `GET` anywhere in this console. Checked directly against `ago-chat`'s own
 * `ConversationsEndpoints.cs`: it maps `GET /queue`, `GET /all`, `POST /{id}/close`,
 * `POST /{id}/read` - no `GET /{id}`. The console's only other single-conversation read is
 * `ConversationPage`'s `JoinConversationAsync`, a SignalR hub call that also *claims* the conversation
 * for the calling operator as a side effect - wrong to poll from an admin screen, both because the
 * conversation being erased may not be assigned to the caller at all, and because claiming a
 * conversation mid-erasure is not a read.
 *
 * `GET /api/v1/conversations/{conversationId}` below is this worker's own best guess at the route the
 * backend side is most likely to add for this need - the natural single-resource `GET` alongside the
 * existing `/close` and `/read` writes on the same path - <b>not a confirmed contract.</b> Flagged
 * here, and in this worker's own report, for the managing session to reconcile against whatever
 * `ago-chat`'s `16-02` branch actually ships before either side merges.
 *
 * Shares `ErasureCheckOutcome`'s three-state shape with `operatorsApi.ts#checkOperatorErasure`: `ok`
 * is `"pending"`, `404` is `"erased"`, anything else (including a network failure) is `"unknown"` and
 * never mistaken for completion.
 */
export async function checkConversationErasure(
  accessToken: string,
  conversationId: string,
): Promise<ErasureCheckOutcome> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}`, {
      headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
    });
  } catch {
    return "unknown";
  }

  if (response.status === 404) {
    return "erased";
  }

  if (response.ok) {
    return "pending";
  }

  return "unknown";
}

/**
 * `18-07`: `GET /api/v1/conversations/{id}/visitor-history` - the returning-visitor-history panel's
 * own read, gated server-side on `conversation:read` plus "you are assigned to *this* conversation"
 * (`GetVisitorHistoryHandler`'s own remarks, `Ago.Chat.Application`), same operator-scoped pattern as
 * `markConversationRead`/`closeConversation` above, not a general lookup by visitor id.
 */
export async function fetchVisitorHistory(
  accessToken: string,
  conversationId: string,
  beforeId?: string,
): Promise<VisitorHistoryResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/visitor-history`);
  if (beforeId) {
    url.searchParams.set("beforeId", beforeId);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load the visitor's prior conversations: ${response.status}`);
  }

  return (await response.json()) as VisitorHistoryResponse;
}

/** `18-01`: the query `searchConversations` below sends - a plain object rather than positional
 * parameters, because `from`/`to`/`beforeMessageId` are all optional and a five-argument call with
 * three of them routinely `undefined` reads worse than a caller building this shape once. */
export interface SearchConversationsParams {
  phrase: string;
  /** ISO-8601, as `date-and-time.md` requires for anything crossing the wire. Omit to let the server
   * default the window (`SearchConversationsHandler`'s own three-month default) - never inferred or
   * pre-filled here, since the response's own `searchedFrom`/`searchedTo` is the only honest source
   * for "what range did this actually search" (see this function's own doc comment). */
  from?: string;
  to?: string;
  beforeMessageId?: string;
  pageSize?: number;
}

/**
 * `18-01`: `GET /api/v1/conversations/search` - full-text search across every conversation on the
 * site, gated on `site:configure` server-side (`SearchConversationsHandler`'s own remarks, the same
 * gate `fetchAllConversationsForSite` above already uses for the identical "site-wide oversight, not
 * an ordinary operator's own view" reasoning). Throws `ApiProblemError`, not a bare `Error`, like
 * `closeConversation`/`eraseConversation` above and unlike the plain reads earlier in this file -
 * `SearchConversationsPage` has to branch on *which* failure this is
 * (`Conversation.Forbidden` vs `Conversation.SearchInvalidQuery`), the same reason `closeOutcome.ts`
 * exists for `closeConversation`.
 *
 * <b>Positioning a click-through at the matched message is not this function's job.</b> The backlog
 * item's own contract note says opening a hit "re-uses the existing conversation-history read,
 * positioned at `MessageId`" - but the only conversation-history read this console has
 * (`OperatorConnection.joinConversation`/`loadOlderHistory`, both backed by
 * `GetConversationHistoryHandler`) requires the caller to *already be the conversation's assigned
 * operator* (`ago-chat`'s own `HandleAsOperatorAsync`: `conversation.OperatorId != query.RequestedBy`
 * is a hard `Forbidden`, not something `site:configure` bypasses - confirmed by reading
 * `GetConversationHistoryHandler.cs`, `OperatorHub.JoinConversationAsync` and
 * `AssignConversationHandler.cs` directly in the `ago-chat` branch this item's backend shipped on).
 * A site-wide search's whole point is surfacing conversations the searching operator is *not*
 * assigned to, so most hits cannot be opened this way at all - `AdminConversationsPage`'s own doc
 * comment already states the identical limitation for `/all`'s rows, from `5-08`, and this item's
 * backend did not extend it. `ConversationPage` (`?at=<sequence>`) still attempts the real join for an
 * `Assigned` hit - it succeeds exactly when that hit happens to be the searching operator's own
 * conversation - and reports a plain failure otherwise, rather than this console inventing a
 * site-wide read the backend does not offer. `Waiting` hits are never linked at all: joining one would
 * silently *claim* it (`Conversation.AssignTo`'s only non-no-op path), which is a mutation this
 * read-only search must not trigger as a side effect of being clicked, and `Closed` hits can never be
 * (re)joined by anyone, ever (`AssignTo` throws for any non-`Waiting` state that is not already this
 * operator's own).
 */
export async function searchConversations(
  accessToken: string,
  params: SearchConversationsParams,
): Promise<SearchConversationsResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/search`);
  url.searchParams.set("phrase", params.phrase);
  if (params.from) {
    url.searchParams.set("from", params.from);
  }
  if (params.to) {
    url.searchParams.set("to", params.to);
  }
  if (params.beforeMessageId) {
    url.searchParams.set("beforeMessageId", params.beforeMessageId);
  }
  if (params.pageSize) {
    url.searchParams.set("pageSize", String(params.pageSize));
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return (await response.json()) as SearchConversationsResponse;
  }

  throw await problemDetailsFrom(response);
}

/** `18-08`: the query `fetchOperatorAnalytics` below sends - both bounds optional, the same "let the
 * server default the window" shape `SearchConversationsParams` already establishes for `18-01`. */
export interface OperatorAnalyticsParams {
  /** ISO-8601, as `date-and-time.md` requires for anything crossing the wire. Omit to let the server
   * default the window (`GetOperatorAnalyticsForSiteHandler`'s own thirty-day default) - never
   * inferred or pre-filled here, since the response's own `from`/`to` is the only honest source for
   * "what range did this actually report on" (the same reasoning `searchConversations`'s own doc
   * comment gives for `searchedFrom`/`searchedTo`). */
  from?: string;
  to?: string;
}

/**
 * `18-08`: `GET /api/v1/conversations/analytics` - the site owner's own basic self-service report,
 * gated on `site:configure` server-side (`GetOperatorAnalyticsForSiteHandler`'s own remarks - the same
 * gate `fetchAllConversationsForSite`/`searchConversations` above already use for the identical
 * "site-wide oversight, not an ordinary operator's own view" reasoning). Throws `ApiProblemError`, not
 * a bare `Error`, like `searchConversations` above - `OperatorAnalyticsPage` has to branch on *which*
 * failure this is (`Conversation.Forbidden` vs `Analytics.InvalidRange`).
 */
export async function fetchOperatorAnalytics(
  accessToken: string,
  params: OperatorAnalyticsParams,
): Promise<OperatorAnalyticsResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/analytics`);
  if (params.from) {
    url.searchParams.set("from", params.from);
  }
  if (params.to) {
    url.searchParams.set("to", params.to);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return (await response.json()) as OperatorAnalyticsResponse;
  }

  throw await problemDetailsFrom(response);
}

/** `18-10`: the same optional-bounds shape `OperatorAnalyticsParams` already establishes for `18-08` -
 * omit either or both to let the server default the window (`GetConversionReportForSiteHandler`'s own
 * thirty-day default). A caller wanting a preset (calendar month, previous calendar month, last 30
 * days) resolves it client-side first (`../time/rangePresets.js`) into concrete `from`/`to` values -
 * there is no server-side preset concept (that module's own doc comment explains why). */
export interface ConversionReportParams {
  from?: string;
  to?: string;
}

/** `18-14`: the query `fetchBookingFlowReport` below sends - the same "both bounds optional, let the
 * server default the window" shape `OperatorAnalyticsParams` already establishes. */
export interface BookingFlowReportParams {
  from?: string;
  to?: string;
}

/**
 * `18-10`: `GET /api/v1/conversations/conversion-report` - the site owner's own conversion report,
 * gated on `site:configure` server-side, the identical shape `fetchOperatorAnalytics` above already
 * establishes for its sibling report. Throws `ApiProblemError` for the same reason that one does -
 * `ConversionReportPage` has to branch on `Conversation.Forbidden` vs `Analytics.InvalidRange`.
 */
export async function fetchConversionReport(
  accessToken: string,
  params: ConversionReportParams,
): Promise<ConversionReportResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/conversion-report`);
  if (params.from) {
    url.searchParams.set("from", params.from);
  }
  if (params.to) {
    url.searchParams.set("to", params.to);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return (await response.json()) as ConversionReportResponse;
  }

  throw await problemDetailsFrom(response);
}

/** `18-10`: `GET /api/v1/conversations/{id}/outcome` - the conversation detail panel's own read,
 * gated on `conversation:read` server-side (`GetConversationOutcomeHandler`'s own remarks,
 * `ago-chat`). The same `ApiProblemError`-throwing shape as `fetchConversationTags`, since a caller may
 * need to tell `Conversation.Forbidden` apart from `Conversation.NotFound`. */
export async function fetchConversationOutcome(
  accessToken: string,
  conversationId: string,
): Promise<ConversationOutcomeResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/outcome`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return (await response.json()) as ConversationOutcomeResponse;
  }

  throw await problemDetailsFrom(response);
}

/**
 * `18-10`: `PUT /api/v1/conversations/{id}/outcome` - an operator recording what a conversation led
 * to. `PUT`, not `POST`, matching `SetConversationOutcomeRequest`'s own remarks (`ago-chat`): the body
 * asserts the state ("this conversation's outcome is now X"), the same shape
 * `MarkConversationReadRequest` already uses for an analogous state assertion. `204 No Content` on
 * success, the same "nothing to return, the console already knows what it just set" contract
 * `closeConversation` above documents in full.
 */
export async function setConversationOutcome(
  accessToken: string,
  conversationId: string,
  outcome: string,
): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/outcome`, {
    method: "PUT",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ outcome }),
  });

  if (response.ok) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/**
 * `18-14`: `GET /api/v1/conversations/module-flow-report` - the console's own chat-to-booking
 * conversion block, gated on `site:configure` server-side
 * (`GetModuleFlowReportForSiteHandler`'s own remarks, `ago-chat`) - the same gate
 * `fetchOperatorAnalytics` above already uses. Throws `ApiProblemError`, not a bare `Error`, like
 * `fetchOperatorAnalytics` - `BookingFlowConversionPage` has to branch on *which* failure this is
 * (`Conversation.Forbidden` vs `ModuleFlow.InvalidRange`).
 */
export async function fetchBookingFlowReport(
  accessToken: string,
  params: BookingFlowReportParams,
): Promise<BookingFlowReportResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/module-flow-report`);
  if (params.from) {
    url.searchParams.set("from", params.from);
  }
  if (params.to) {
    url.searchParams.set("to", params.to);
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return (await response.json()) as BookingFlowReportResponse;
  }

  throw await problemDetailsFrom(response);
}
