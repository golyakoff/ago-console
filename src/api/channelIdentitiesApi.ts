import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

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

/** `GET /api/v1/conversations/{id}/channel-identities` - the visitor's own active channel identities,
 * gated server-side on `conversation:read` plus the per-conversation assignment check
 * (`ListChannelIdentitiesForVisitorHandler`'s own remarks, `ago-chat`). */
export async function fetchChannelIdentities(accessToken: string, conversationId: string): Promise<ChannelIdentityDto[]> {
  const response = await fetch(channelIdentitiesUrl(conversationId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { channelIdentities: ChannelIdentityDto[] };
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
