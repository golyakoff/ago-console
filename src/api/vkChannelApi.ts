import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

/**
 * `25-15`: the console's own VK connect/disconnect flow, against `Ago.Chat.Api.Channels.
 * VkChannelEndpoints`'s real wire shape - the same `adr/0069` "the shop's own token never round-trips"
 * guarantee `telegramChannelApi.ts`/`maxChannelApi.ts` already make: nothing exported from this module
 * can carry the community's own access token, because nothing the server ever sends back carries it
 * either (`VkChannelEndpoints.ConnectVkChannelResponse`'s own remarks).
 *
 * ## No status read - the one real shape difference from `telegramChannelApi.ts`/`maxChannelApi.ts`
 *
 * `VkChannelEndpoints.MapVkChannelEndpoints` maps only `POST`/`DELETE` at
 * `/api/v1/sites/{siteId}/channels/vk[/{id}]` - there is no `GET`. Checked directly against the source
 * (not assumed from Telegram's/MAX's shape - the exact mistake `25-09`'s own brief warned against):
 * `WhatsAppChannelEndpoints`/`AvitoChannelEndpoints` have the identical gap, so this is not a VK-specific
 * oversight. `TelegramChannelEndpoints`/`MaxChannelEndpoints` both have a `GET`, backed by the
 * channel-neutral `GetChannelCredentialStatusHandler` (`Ago.Chat.Application.UseCases.
 * GetChannelCredentialStatus`) - a handler VK's own connect/disconnect handlers already share the
 * permission check and repository with, so wiring a `GET` route for VK would be a small, low-risk
 * addition (mirroring `MaxChannelEndpoints.HandleStatusAsync` almost verbatim). That is backend work in
 * `ago-chat`, outside this frontend-only item's own scope - flagged here, and in the dispatching
 * session's own report, rather than worked around with a client-side substitute (a `localStorage` cache
 * of "am I connected" would silently lie the moment a different operator or browser opens this screen,
 * exactly the failure `23-36`'s own brief opens with). `VkChannelPage`'s own doc comment has the
 * console-side consequence: no persisted "connected" view across a reload, because there is nothing this
 * module could read to rebuild one.
 */
export interface ConnectVkChannelResponseDto {
  channelCredentialId: string;
  createdAt: string;
  /** Where the operator pastes this into VK's own community "Callback API" settings screen. */
  callbackUrl: string;
  /** AGO's own generated value, not the community's token - the one field in any of these four
   * connect responses that is legitimately shown at all (`VkChannelEndpoints.ConnectVkChannelResponse`'s
   * own remarks contrast this with Telegram's/MAX's, which return neither). Shown once, here, the same
   * "plaintext exists in exactly one response" guarantee `installKeyCopyButton`'s own public key has. */
  webhookSecret: string;
}

function vkChannelHeaders(accessToken: string, init?: RequestInit): HeadersInit {
  return withActiveSiteHeader({
    Authorization: `Bearer ${accessToken}`,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
}

async function vkChannelFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: vkChannelHeaders(accessToken, init) });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as T;
}

/** `token` never round-trips - this call sends it once and the response type
 * ({@link ConnectVkChannelResponseDto}) has no field it could come back through. */
export function connectVkChannel(accessToken: string, siteId: string, token: string): Promise<ConnectVkChannelResponseDto> {
  return vkChannelFetch<ConnectVkChannelResponseDto>(accessToken, `/api/v1/sites/${siteId}/channels/vk`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disconnectVkChannel(accessToken: string, siteId: string, channelCredentialId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channels/vk/${channelCredentialId}`, {
    method: "DELETE",
    headers: vkChannelHeaders(accessToken),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

export { ApiProblemError };
