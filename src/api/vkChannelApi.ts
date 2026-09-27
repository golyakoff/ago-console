import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `25-15`/`25-65`: the console's own VK connect/status/disconnect flow, against `Ago.Chat.Api.Channels.
 * VkChannelEndpoints`'s real wire shape - the same `adr/0069` "the shop's own token never round-trips"
 * guarantee `telegramChannelApi.ts`/`maxChannelApi.ts` already make: nothing exported from this module
 * can carry the community's own access token, because nothing the server ever sends back carries it
 * either (`VkChannelEndpoints.ConnectVkChannelResponse`/`VkChannelStatusResponse`'s own remarks).
 *
 * ## `25-65`: the status read this module's own `25-15` doc comment named as a real, load-bearing gap
 *
 * `VkChannelEndpoints.MapVkChannelEndpoints` mapped only `POST`/`DELETE` at
 * `/api/v1/sites/{siteId}/channels/vk[/{id}]` before `25-65` - no `GET`, the identical gap
 * `WhatsAppChannelEndpoints`/`AvitoChannelEndpoints` still have (out of `25-65`'s own scope; neither has
 * a console screen yet for this same reason). `25-65` added `GET`, backed by the channel-neutral
 * `GetChannelCredentialStatusHandler` `TelegramChannelEndpoints`/`MaxChannelEndpoints` already used -
 * mirroring `MaxChannelEndpoints.HandleStatusAsync` almost verbatim, the same three-field shape this
 * interface used to have, not Telegram's live-checked seven: at the time, VK's own public API had no
 * side-effect-free per-request equivalent of Telegram's `getMe` any more than MAX's did.
 *
 * ## `25-175`: the same live check Telegram's route has always done, now here too
 *
 * `25-175` gave `VkChannelEndpoints.HandleStatusAsync` a live check on every read, the same
 * `VkLiveTokenCheck` wrapping `VkApiClient.GroupsGetById` mirrors `TelegramLiveTokenCheck`'s and (since
 * `25-174`) `MaxLiveTokenCheck`'s own bounded-timeout/three-outcome (`Verified`/`Refused`/
 * `ProviderUnreachable`) shape. {@link VkChannelStatusDto} carries the identical four extra fields
 * `TelegramChannelStatusDto`/`MaxChannelStatusDto` do as a result - this interface used to argue, from a
 * since-corrected premise, that VK's API had no cheap way to ask this live; `25-175` gave it exactly
 * that (`docs/backlog/25-175-*.md`).
 *
 * `VkChannelStatusDto` deliberately carries neither `callbackUrl` nor `webhookSecret` -
 * `GetChannelCredentialStatusHandler` never had either to give back (`ChannelCredentialStatus`'s own
 * shape - an id and a timestamp, nothing else), and `callbackUrl`/`webhookSecret` only ever existed as
 * values `VkChannelEndpoints.HandleConnectAsync` computed once, at connect time
 * ({@link ConnectVkChannelResponseDto}'s own remarks). A reload can now show "Connected, since <date>"
 * (this module's own `fetchVkChannelStatus`) but never the callback URL or secret again - `VkChannelPage`'s
 * own doc comment has the console-side consequence and why that is correct, not a remaining gap.
 */
export interface VkChannelStatusDto {
  connected: boolean;
  channelCredentialId: string | null;
  createdAt: string | null;
  /** `null` when `connected` is `false`, or when `unreachable` is `true` - both mean "nothing was
   * actually verified", for different reasons (nothing to check yet, versus couldn't check it). */
  verified: boolean | null;
  /** The live check could not complete at all - a timeout (bounded server-side, the same
   * `VkLiveTokenCheck.Timeout` `TelegramLiveTokenCheck.Timeout`'s own reasoning applies to unchanged)
   * or a transient failure reaching VK. Structurally distinct from a refusal on purpose: a tenant acts
   * on the two differently (wait and retry, versus get a new token). Always `false` when `connected`
   * is `false` - the live check is never attempted when there is no credential to check. */
  unreachable: boolean;
  /** VK's own refusal text - present only when `verified` is `false` **and** `unreachable` is
   * `false` (a real refusal, not an unreachable provider). Never anything this console generated from
   * the token itself - matching `TelegramChannelStatusDto.refusalReason`'s own guarantee. */
  refusalReason: string | null;
  checkedAt: string;
}

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

/**
 * `23-118`/`23-99`: the runtime shape the status read promises. Every field is present-but-nullable
 * (none is `?`), so all seven are required keys. `connected` is the load-bearing one: dropped, it reads
 * as `false` and the screen renders "not connected" for a shop whose VK community is live - the false
 * negative the `23-99` bound names explicitly for a channel-connection-status object.
 */
const vkChannelStatusRequiredKeys = requiredKeysOf<VkChannelStatusDto>({
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
 * this file already produces (`problemDetailsFrom`), so `VkChannelPage`'s existing `catch` needs no
 * second error vocabulary (mirrors `conversationsApi.ts#rethrowAsApiProblem`).
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

/** `25-65`: the same route `connectVkChannel`/`disconnectVkChannel` already call, `GET` instead of
 * `POST`/`DELETE` - `maxChannelApi.ts`'s own `fetchMaxChannelStatus` precedent. `23-118`/`23-99`
 * validates the promised shape before returning, the same reason that precedent does. */
export async function fetchVkChannelStatus(accessToken: string, siteId: string): Promise<VkChannelStatusDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channels/vk`, {
    headers: vkChannelHeaders(accessToken),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<VkChannelStatusDto>(body, vkChannelStatusRequiredKeys, "GET /api/v1/sites/{siteId}/channels/vk");
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body;
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
