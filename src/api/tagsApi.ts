import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/** `18-04`'s exact wire shape (`Ago.Chat.Api`'s `TagEndpoints`). Labels only - no field here carries
 * any meaning to automation (routing, SLAs), matching `Tag`'s own doc comment (`ago-chat`). */
export interface TagDto {
  id: string;
  name: string;
  createdAt: string;
}

/** `19-02`'s exact wire shape for `GET /api/v1/conversations/{id}/tags` only (`Ago.Chat.Api`'s
 * `TagEndpoints.ConversationTagResponseDto`) - the site vocabulary endpoints keep returning plain
 * `TagDto`, since only a per-conversation association has a `source` to carry
 * (`ago-chat`'s `ConversationTagDto`'s own remarks). */
export interface ConversationTagDto extends TagDto {
  /** `"Operator"` or `"Ai"` - the CLR member name of `Ago.Chat.Domain.TagSource`, passed through
   * unchanged (the same "wire DTO carries a plain projection, never re-encoded" rule this codebase's
   * other CLR-member-name string fields already follow). */
  source: "Operator" | "Ai";
}

function vocabularyUrl(siteId: string, tagId?: string): string {
  const base = `${config.apiBaseUrl}/api/v1/sites/${siteId}/tags`;
  return tagId ? `${base}/${tagId}` : base;
}

function conversationTagsUrl(conversationId: string, tagId?: string): string {
  const base = `${config.apiBaseUrl}/api/v1/conversations/${conversationId}/tags`;
  return tagId ? `${base}/${tagId}` : base;
}

/** `GET /api/v1/sites/{siteId}/tags` - the site's own tag vocabulary, gated server-side on
 * `conversation:read` (`ListTagsHandler`'s own remarks: every operator who can see conversations may
 * browse the vocabulary, only managing it is `site:configure`-gated). */
export async function fetchTags(accessToken: string, siteId: string): Promise<TagDto[]> {
  const response = await fetch(vocabularyUrl(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { tags: TagDto[] };
  return body.tags;
}

/** `POST /api/v1/sites/{siteId}/tags` - `site:configure`-gated (`CreateTagHandler`'s own remarks). */
export async function createTag(accessToken: string, siteId: string, name: string): Promise<TagDto> {
  const response = await fetch(vocabularyUrl(siteId), {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as TagDto;
}

/** `PUT /api/v1/sites/{siteId}/tags/{tagId}` - renames a tag in place, keeping every existing
 * `conversation_tags` association (`RenameTagHandler`'s own remarks, `ago-chat`). */
export async function renameTag(accessToken: string, siteId: string, tagId: string, name: string): Promise<TagDto> {
  const response = await fetch(vocabularyUrl(siteId, tagId), {
    method: "PUT",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as TagDto;
}

/** `DELETE /api/v1/sites/{siteId}/tags/{tagId}` - `204 No Content`. */
export async function deleteTag(accessToken: string, siteId: string, tagId: string): Promise<void> {
  const response = await fetch(vocabularyUrl(siteId, tagId), {
    method: "DELETE",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/** `GET /api/v1/conversations/{id}/tags` - every tag currently applied to one conversation, each
 * carrying its own `source` (`19-02`). */
export async function fetchConversationTags(accessToken: string, conversationId: string): Promise<ConversationTagDto[]> {
  const response = await fetch(conversationTagsUrl(conversationId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { tags: ConversationTagDto[] };
  return body.tags;
}

/** `POST /api/v1/conversations/{id}/tags/{tagId}` - idempotent server-side
 * (`ITagRepository.AddToConversationAsync`'s own remarks), `204 No Content`. */
export async function applyTagToConversation(accessToken: string, conversationId: string, tagId: string): Promise<void> {
  const response = await fetch(conversationTagsUrl(conversationId, tagId), {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}

/** `DELETE /api/v1/conversations/{id}/tags/{tagId}` - idempotent, `204 No Content`. */
export async function removeTagFromConversation(accessToken: string, conversationId: string, tagId: string): Promise<void> {
  const response = await fetch(conversationTagsUrl(conversationId, tagId), {
    method: "DELETE",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}
