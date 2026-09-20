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
 * ## The same status shape as Telegram's, now for real
 *
 * `25-174` gave `MaxChannelEndpoints.HandleStatusAsync` the same live check Telegram's own status route
 * has always done - `MaxLiveTokenCheck` wrapping `MaxApiClient.GetMeAsync`, called on every read, the
 * same bounded-timeout/three-outcome (`Verified`/`Refused`/`ProviderUnreachable`) shape
 * `TelegramLiveTokenCheck` established first. {@link MaxChannelStatusDto} carries the identical four
 * extra fields `TelegramChannelStatusDto` does as a result - this interface used to argue, from a since-
 * corrected premise, that MAX's API had no cheap way to ask this live; `25-174` gave it exactly that
 * (`docs/backlog/25-174-*.md`).
 */
export interface MaxChannelStatusDto {
  connected: boolean;
  channelCredentialId: string | null;
  createdAt: string | null;
  /** `null` when `connected` is `false`, or when `unreachable` is `true` - both mean "nothing was
   * actually verified", for different reasons (nothing to check yet, versus couldn't check it). */
  verified: boolean | null;
  /** The live check could not complete at all - a timeout (bounded server-side, the same
   * `MaxLiveTokenCheck.Timeout` `TelegramLiveTokenCheck.Timeout`'s own reasoning applies to
   * unchanged) or a transient failure reaching MAX. Structurally distinct from a refusal on purpose:
   * a tenant acts on the two differently (wait and retry, versus get a new token). Always `false`
   * when `connected` is `false` - the live check is never attempted when there is no credential to
   * check. */
  unreachable: boolean;
  /** MAX's own refusal text - present only when `verified` is `false` **and** `unreachable` is
   * `false` (a real refusal, not an unreachable provider). Never anything this console generated from
   * the token itself - matching `TelegramChannelStatusDto.refusalReason`'s own guarantee. */
  refusalReason: string | null;
  checkedAt: string;
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
