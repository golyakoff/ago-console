import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `23-36`: the console's own Telegram connect/status/disconnect flow, against `Ago.Chat.Api.Channels.
 * TelegramChannelEndpoints`'s real wire shape - `adr/0069`'s "the console never shows it back" made
 * concrete: nothing exported from this module can carry the shop's own bot token, because nothing the
 * server ever sends back carries it either.
 *
 * `GET`/`POST`/`DELETE` all live at the same `/api/v1/sites/{siteId}/channels/telegram[/{id}]` group
 * `TelegramChannelEndpoints.MapTelegramChannelEndpoints` maps - one module for the one screen that
 * calls all three, the same "thin wire-shape file over every endpoint one screen needs" shape
 * `operatorTeamApi.ts` already established.
 */
export interface TelegramChannelStatusDto {
  connected: boolean;
  channelCredentialId: string | null;
  createdAt: string | null;
  /** `null` when `connected` is `false`, or when `unreachable` is `true` - both mean "nothing was
   * actually verified", for different reasons (nothing to check yet, versus couldn't check it). */
  verified: boolean | null;
  /** `adr/0143`: the live check could not complete at all - a timeout (the read is bounded to 5
   * seconds server-side) or a transient failure reaching Telegram, this deployment's own SOCKS5 relay
   * included. Structurally distinct from a refusal on purpose: a tenant acts on the two differently
   * (wait and retry, versus get a new token). Always `false` when `connected` is `false` - the live
   * check is never attempted when there is no credential to check. */
  unreachable: boolean;
  /** Telegram's own refusal text - present only when `verified` is `false` **and** `unreachable` is
   * `false` (a real refusal, not an unreachable provider). Never anything this console generated from
   * the token itself - `TelegramChannelEndpoints.TelegramChannelStatusResponse`'s own remarks on why
   * no field here could be shaped like a secret. */
  refusalReason: string | null;
  checkedAt: string;
}

export interface ConnectTelegramChannelResponseDto {
  channelCredentialId: string;
  createdAt: string;
}

function telegramChannelHeaders(accessToken: string, init?: RequestInit): HeadersInit {
  return withActiveSiteHeader({
    Authorization: `Bearer ${accessToken}`,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
}

async function telegramChannelFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: telegramChannelHeaders(accessToken, init) });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as T;
}

/**
 * `23-118`/`23-99`: the runtime shape the status read promises. Every field is present-but-nullable
 * (none is `?`), so all seven are required keys. `connected` is the load-bearing one: dropped, it reads
 * as `false` and the screen renders "not connected" for a shop whose Telegram bot is live - the false
 * negative the `23-99` bound names explicitly for a channel-connection-status object.
 */
const telegramChannelStatusRequiredKeys = requiredKeysOf<TelegramChannelStatusDto>({
  connected: true,
  channelCredentialId: true,
  createdAt: true,
  verified: true,
  unreachable: true,
  refusalReason: true,
  checkedAt: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `ApiProblemError` - the same type every other rejection in
 * this file already produces (`problemDetailsFrom`), so `TelegramChannelPage`'s existing `catch` needs
 * no second error vocabulary (mirrors `conversationsApi.ts#rethrowAsApiProblem`).
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

export async function fetchTelegramChannelStatus(accessToken: string, siteId: string): Promise<TelegramChannelStatusDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channels/telegram`, {
    headers: telegramChannelHeaders(accessToken),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<TelegramChannelStatusDto>(body, telegramChannelStatusRequiredKeys, "GET /api/v1/sites/{siteId}/channels/telegram");
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body;
}

/** `token` never round-trips - this call sends it once and the response type
 * ({@link ConnectTelegramChannelResponseDto}) has no field it could come back through. */
export function connectTelegramChannel(
  accessToken: string,
  siteId: string,
  token: string,
): Promise<ConnectTelegramChannelResponseDto> {
  return telegramChannelFetch<ConnectTelegramChannelResponseDto>(accessToken, `/api/v1/sites/${siteId}/channels/telegram`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disconnectTelegramChannel(
  accessToken: string,
  siteId: string,
  channelCredentialId: string,
): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channels/telegram/${channelCredentialId}`, {
    method: "DELETE",
    headers: telegramChannelHeaders(accessToken),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

export { ApiProblemError };
