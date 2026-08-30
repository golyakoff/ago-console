import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `14-14`/`adr/0079` section 6's exact wire shape (`Ago.Chat.Api`'s `ContactDetailEndpoints`, backed by
 * `RecordVisitorContactDetailHandler`/`ListVisitorContactDetailsHandler`/`DeleteVisitorContactDetailHandler`).
 * `kind` is the `Domain.VisitorContactDetailKind` member name verbatim (`"Phone"`, `"Email"`, `"Other"`)
 * - never a display label, the same "technical value, rendered by the console" split
 * `ChannelIdentityDto.kind` already establishes for `ago-chat`'s other closed-enum wire field.
 *
 * **Never confuse this with `ChannelIdentityDto`.** A contact detail is a hand-typed, unverified fact
 * an operator recorded - it is never used for delivery and never becomes a channel identity through
 * any path this client (or `ago-chat`) offers. See `ContactDetailsPanel`'s own doc comment.
 */
export interface ContactDetailDto {
  id: string;
  kind: string;
  value: string;
  recordedByOperatorId: string;
  recordedAt: string;
}

function url(conversationId: string): string {
  return `${config.apiBaseUrl}/api/v1/conversations/${conversationId}/contact-details`;
}

/** `GET /api/v1/conversations/{id}/contact-details`, oldest first - `ListVisitorContactDetailsHandler`'s
 * own ordering. Gated server-side on `conversation:read`. */
export async function fetchContactDetails(accessToken: string, conversationId: string): Promise<ContactDetailDto[]> {
  const response = await fetch(url(conversationId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { contactDetails: ContactDetailDto[] };
  return body.contactDetails;
}

/** `POST /api/v1/conversations/{id}/contact-details` - gated server-side on `conversation:send`
 * (`RecordVisitorContactDetailHandler`'s own remarks: recording a fact told to the operator is not
 * more sensitive than replying in the conversation). Author and timestamp are stamped by the server,
 * never sent by this client. */
export async function recordContactDetail(
  accessToken: string,
  conversationId: string,
  kind: string,
  value: string,
): Promise<ContactDetailDto> {
  const response = await fetch(url(conversationId), {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ kind, value }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as ContactDetailDto;
}

/** `DELETE /api/v1/conversations/{id}/contact-details/{id}` - `204 No Content`, gated server-side on
 * `conversation:send`, the same permission recording one needs (`DeleteVisitorContactDetailHandler`'s
 * own remarks: there is no separate "unlink"-style permission here, unlike `channel_identity:unlink`,
 * since there is no routing capability to protect). */
export async function deleteContactDetail(accessToken: string, conversationId: string, contactDetailId: string): Promise<void> {
  const response = await fetch(`${url(conversationId)}/${contactDetailId}`, {
    method: "DELETE",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 204) {
    return;
  }

  throw await problemDetailsFrom(response);
}
