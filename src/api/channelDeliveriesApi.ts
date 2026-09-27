import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

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

/**
 * `23-118`/`23-99`: the runtime shape every delivery row promises, checked per element before the list
 * is returned. `providerMessageId`/`failureReason` are optional (`?`), so they are not required keys -
 * the mapped `RequiredKeys<ChannelDeliveryDto>` type this literal satisfies drops them on its own, and
 * adding a required field to the DTO stops this literal compiling until it is listed too
 * (`shapeGuard.ts`'s own doc comment).
 */
const channelDeliveryRequiredKeys = requiredKeysOf<ChannelDeliveryDto>({
  id: true,
  messageId: true,
  channelKind: true,
  status: true,
  attemptedAt: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `ApiProblemError` - the same type, and the same `catch`,
 * every other rejection in this file already produces (`problemDetailsFrom`), so a caller needs no
 * second error vocabulary (mirrors `conversationsApi.ts#rethrowAsApiProblem`). `reason.diagnostic` (the
 * endpoint and the wire field names) rather than the English `message` is what a localized frame wraps.
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

/** `GET /api/v1/conversations/{id}/channel-deliveries` - gated server-side on `conversation:read`
 * plus the per-conversation assignment check (`GetChannelDeliveriesForConversationHandler`'s own
 * remarks, `ago-chat`). Empty for a widget conversation - `Thread`'s own `threadDeliveryScopeNote`
 * caption is what tells the operator that is expected, not a failure. `23-118`/`23-99`: which is
 * exactly why the shape is validated before returning - a dropped `deliveries` array (or a truncated
 * row) would otherwise render as that same "no deliveries, expected" state rather than as a failure. */
export async function fetchChannelDeliveries(accessToken: string, conversationId: string): Promise<ChannelDeliveryDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/channel-deliveries`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { deliveries?: unknown };
  try {
    assertArrayHasKeys<ChannelDeliveryDto>(
      body.deliveries,
      channelDeliveryRequiredKeys,
      "GET /api/v1/conversations/{id}/channel-deliveries",
    );
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body.deliveries;
}
