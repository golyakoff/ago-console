import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `18-04`'s exact wire shape (`Ago.Chat.Api`'s `NoteEndpoints`, backed by
 * `AddConversationNoteHandler`/`GetConversationNotesHandler`). Never reachable from any visitor-facing
 * path - see `ago-chat`'s `INoteRepository`/`ConversationNote` for the structural guarantee this
 * client is calling into; this file exists only behind `RequireOperatorIdentity`.
 */
export interface ConversationNoteDto {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

function url(conversationId: string): string {
  return `${config.apiBaseUrl}/api/v1/conversations/${conversationId}/notes`;
}

/**
 * `23-118`/`23-99`: the shape each note promises. `ConversationNotesPanel` renders this list, and an
 * empty list is a legitimate "no notes yet" - so a dropped field, or a dropped list, would read as
 * that empty rather than as a reader that did not answer. Only the list read guards this; the
 * `addConversationNote` write below is the echo of an act the operator just took, out of scope.
 */
const conversationNoteRequiredKeys = requiredKeysOf<ConversationNoteDto>({
  id: true,
  authorId: true,
  body: true,
  createdAt: true,
});

/** `GET /api/v1/conversations/{id}/notes`, oldest first - `GetConversationNotesHandler`'s own
 * ordering. */
export async function fetchConversationNotes(accessToken: string, conversationId: string): Promise<ConversationNoteDto[]> {
  const response = await fetch(url(conversationId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { notes?: unknown };
  try {
    assertArrayHasKeys<ConversationNoteDto>(body.notes, conversationNoteRequiredKeys, "GET /api/v1/conversations/{id}/notes");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new ApiProblemError("shape.mismatch", reason.diagnostic, response.status);
    }
    throw reason;
  }
  return body.notes;
}

/** `POST /api/v1/conversations/{id}/notes` - gated server-side on `conversation:note_write`
 * (`AddConversationNoteHandler`'s own remarks). Author and timestamp are stamped by the server, never
 * sent by this client. */
export async function addConversationNote(
  accessToken: string,
  conversationId: string,
  body: string,
): Promise<ConversationNoteDto> {
  const response = await fetch(url(conversationId), {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as ConversationNoteDto;
}
