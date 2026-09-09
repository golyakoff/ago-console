import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

/**
 * `25-09`: the console's own MAX connect/status/disconnect flow, against
 * `Ago.Chat.Api.Channels.MaxChannelEndpoints`'s real wire shape - the same `adr/0069` "the console
 * never shows it back" guarantee `telegramChannelApi.ts` already makes, applied here: nothing exported
 * from this module can carry the shop's own bot token, because nothing the server ever sends back
 * carries it either (`MaxChannelEndpoints.ConnectMaxChannelResponse`/`MaxChannelStatusResponse`'s own
 * remarks - a reflection test in `Ago.Chat.Architecture.Tests` enforces this on the backend side).
 *
 * `GET`/`POST`/`DELETE` all live at the same `/api/v1/sites/{siteId}/channels/max[/{id}]` group
 * `MaxChannelEndpoints.MapMaxChannelEndpoints` maps - the same "thin wire-shape file over every
 * endpoint one screen needs" shape `telegramChannelApi.ts` already established.
 *
 * ## Deliberately not the same status shape as Telegram's
 *
 * {@link MaxChannelStatusDto} has three fields, not `TelegramChannelStatusDto`'s seven - there is no
 * `verified`/`unreachable`/`refusalReason`/`checkedAt` here because `MaxChannelEndpoints.HandleStatusAsync`
 * never asks MAX anything on a status read (that endpoint's own remarks: MAX's public API has no cheap,
 * side-effect-free equivalent of Telegram's `getMe`, and its two credential-shaped calls are either a
 * write `MaxLongPollingService` cannot safely share, or the long-polling read that service already owns
 * exclusively). Copying Telegram's seven-field status shape here would claim a live check this screen
 * cannot actually perform - `MaxChannelPage`'s own remarks have the console-side half of this reasoning.
 */
export interface MaxChannelStatusDto {
  connected: boolean;
  channelCredentialId: string | null;
  createdAt: string | null;
}

export interface ConnectMaxChannelResponseDto {
  channelCredentialId: string;
  createdAt: string;
}

function maxChannelHeaders(accessToken: string, init?: RequestInit): HeadersInit {
  return withActiveSiteHeader({
    Authorization: `Bearer ${accessToken}`,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
}

async function maxChannelFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: maxChannelHeaders(accessToken, init) });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as T;
}

export function fetchMaxChannelStatus(accessToken: string, siteId: string): Promise<MaxChannelStatusDto> {
  return maxChannelFetch<MaxChannelStatusDto>(accessToken, `/api/v1/sites/${siteId}/channels/max`);
}

/** `token` never round-trips - this call sends it once and the response type
 * ({@link ConnectMaxChannelResponseDto}) has no field it could come back through. */
export function connectMaxChannel(
  accessToken: string,
  siteId: string,
  token: string,
): Promise<ConnectMaxChannelResponseDto> {
  return maxChannelFetch<ConnectMaxChannelResponseDto>(accessToken, `/api/v1/sites/${siteId}/channels/max`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disconnectMaxChannel(
  accessToken: string,
  siteId: string,
  channelCredentialId: string,
): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channels/max/${channelCredentialId}`, {
    method: "DELETE",
    headers: maxChannelHeaders(accessToken),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

export { ApiProblemError };
