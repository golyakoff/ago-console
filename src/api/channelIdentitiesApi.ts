import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/** `14-12`/`14-13`'s exact wire shape (`Ago.Chat.Api`'s `ChannelIdentityEndpoints`). `kind` is the
 * `Domain.ChannelKind` member name verbatim (`"Telegram"`, `"Sms"`, ...) - never a display label, the
 * same "technical value, rendered by the console" split `tagsApi.ts`'s own `TagDto` does not need but
 * `channelKindLabel` below does. `isPreferred` (`14-13`): whether this row is the visitor's own
 * `PreferredChannelIdentityId` - always `false` on every row until an operator sets one. */
export interface ChannelIdentityDto {
  channelIdentityId: string;
  kind: string;
  address: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isPreferred: boolean;
}

export interface RequestedChannelLink {
  code: string;
  expiresAt: string;
  kind: string;
}

function channelIdentitiesUrl(conversationId: string): string {
  return `${config.apiBaseUrl}/api/v1/conversations/${conversationId}/channel-identities`;
}

/**
 * `23-118`/`23-99`: the runtime shape every identity row promises, checked per element before the list
 * is returned. Every field is required (none is `?`), so the mapped `RequiredKeys<ChannelIdentityDto>`
 * type this literal satisfies lists all six - add or rename one on the DTO and this stops compiling
 * until it is updated too (`shapeGuard.ts`'s own doc comment).
 */
const channelIdentityRequiredKeys = requiredKeysOf<ChannelIdentityDto>({
  channelIdentityId: true,
  kind: true,
  address: true,
  firstSeenAt: true,
  lastSeenAt: true,
  isPreferred: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `ApiProblemError` - the same type every other rejection in
 * this file already produces (`problemDetailsFrom`), so a caller needs no second error vocabulary
 * (mirrors `conversationsApi.ts#rethrowAsApiProblem`).
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

/** `GET /api/v1/conversations/{id}/channel-identities` - the visitor's own active channel identities,
 * gated server-side on `conversation:read` plus the per-conversation assignment check
 * (`ListChannelIdentitiesForVisitorHandler`'s own remarks, `ago-chat`). `23-118`/`23-99`: the shape is
 * validated before returning because a dropped `channelIdentities` array (or a truncated row) would
 * render as "no linked channels" - a false empty state indistinguishable from a widget-only visitor. */
export async function fetchChannelIdentities(accessToken: string, conversationId: string): Promise<ChannelIdentityDto[]> {
  const response = await fetch(channelIdentitiesUrl(conversationId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { channelIdentities?: unknown };
  try {
    assertArrayHasKeys<ChannelIdentityDto>(
      body.channelIdentities,
      channelIdentityRequiredKeys,
      "GET /api/v1/conversations/{id}/channel-identities",
    );
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body.channelIdentities;
}

/** `POST /api/v1/conversations/{id}/channel-identities/link-requests` - generates a pending link
 * request and returns the plaintext code exactly once (`RequestedChannelLink`'s own remarks,
 * `ago-chat`) - gated server-side on `conversation:send`. */
export async function requestChannelLink(
  accessToken: string,
  conversationId: string,
  kind: string,
): Promise<RequestedChannelLink> {
  const response = await fetch(`${channelIdentitiesUrl(conversationId)}/link-requests`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ kind }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as RequestedChannelLink;
}

/** `POST /api/v1/sites/{siteId}/channel-identities/{id}/unlink` - `204 No Content`, gated server-side
 * on `channel_identity:unlink` (`UnlinkChannelIdentityHandler`'s own remarks, `ago-chat`) - a
 * permission granted to no role by default. */
export async function unlinkChannelIdentity(accessToken: string, siteId: string, channelIdentityId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/channel-identities/${channelIdentityId}/unlink`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/** `PUT /api/v1/conversations/{id}/channel-identities/preference` - `204 No Content`, gated
 * server-side on `conversation:send` (`SetPreferredChannelIdentityHandler`'s own remarks, `ago-chat`).
 * `channelIdentityId: null` is the explicit "back to automatic" request. */
export async function setPreferredChannelIdentity(
  accessToken: string,
  conversationId: string,
  channelIdentityId: string | null,
): Promise<void> {
  const response = await fetch(`${channelIdentitiesUrl(conversationId)}/preference`, {
    method: "PUT",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ channelIdentityId }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}
