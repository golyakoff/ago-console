import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `23-19`'s exact wire shape (`Ago.Chat.Contracts.ChannelDeliveryDto`, `ago-chat`). `channelKind` and
 * `status` are the `Domain.ChannelKind`/`Domain.ChannelDeliveryStatus` member names verbatim - never a
 * display label, the same "technical value, rendered by the console" split
 * `ChannelIdentityDto.kind`'s own doc comment already draws. `messageId` matches `MessageDto.id` -
 * that shared value is what lets `Thread` attach a delivery to the exact operator message it is about.
 */
export interface ChannelDeliveryDto {
  id: string;
  messageId: string;
  channelKind: string;
  status: "Delivered" | "Refused";
  providerMessageId?: string | null;
  failureReason?: string | null;
  attemptedAt: string;
}

/** `GET /api/v1/conversations/{id}/channel-deliveries` - gated server-side on `conversation:read`
 * plus the per-conversation assignment check (`GetChannelDeliveriesForConversationHandler`'s own
 * remarks, `ago-chat`). Empty for a widget conversation - `Thread`'s own `threadDeliveryScopeNote`
 * caption is what tells the operator that is expected, not a failure. */
export async function fetchChannelDeliveries(accessToken: string, conversationId: string): Promise<ChannelDeliveryDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/channel-deliveries`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { deliveries: ChannelDeliveryDto[] };
  return body.deliveries;
}
