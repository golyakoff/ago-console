import { config } from "../config.js";
import { problemDetailsFrom } from "./problemDetails.js";
import type { AllConversationsForSiteResponse, OperatorQueueResponse } from "../realtime/protocol/types.js";

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
export async function fetchOperatorQueue(accessToken: string): Promise<OperatorQueueResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/queue`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
export async function fetchAllConversationsForSite(
  accessToken: string,
  beforeId?: string,
): Promise<AllConversationsForSiteResponse> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/conversations/all`);
  if (beforeId) {
    url.searchParams.set("beforeId", beforeId);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.ok) {
    return;
  }

  throw await problemDetailsFrom(response);
}
