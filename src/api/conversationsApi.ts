import { config } from "../config.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";

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
