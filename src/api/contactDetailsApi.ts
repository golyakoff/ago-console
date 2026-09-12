import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `14-14`/`23-09`/`25-58`/`adr/0079` section 6's exact wire shape (`Ago.Chat.Api`'s
 * `ContactDetailEndpoints`, backed by `ListVisitorContactDetailsHandler`/
 * `EditVisitorContactDetailHandler`/`SetVisitorContactDetailAssessmentHandler`/
 * `RevealVisitorContactDetailHandler`). `kind` is the `Domain.VisitorContactDetailKind` member name
 * verbatim (`"Phone"`, `"Email"`, `"Name"`) - never a display label, the same "technical value,
 * rendered by the console" split `ChannelIdentityDto.kind` already establishes for `ago-chat`'s other
 * closed-enum wire field. `source` is `Domain.VisitorContactDetailSource`'s member name the same way
 * (`"Operator"` | `"Visitor"`).
 *
 * **Never confuse this with `ChannelIdentityDto`.** A contact detail is a hand-typed or
 * visitor-submitted fact - it is never used for delivery and never becomes a channel identity through
 * any path this client (or `ago-chat`) offers. See `ContactDetailsPanel`'s own doc comment.
 *
 * `23-09`: `recordedByOperatorId` is nullable and `verified` is new - a visitor-supplied row
 * (`source: "Visitor"`) has no operator behind it and is never verified
 * (`Domain.VisitorContactDetail`'s own remarks on why nothing in this codebase yet sets `verified`
 * `true`). `ContactDetailsPanel` renders `source`, never the raw operator id, so a null
 * `recordedByOperatorId` never needs to be special-cased into an empty cell or a fabricated name.
 *
 * `25-58`: `assessment` is new, and is never `verified` restated under a new name - an operator's own,
 * overridable "confirmed"/"invalid" call on a Phone/Email row, distinct from `verified`'s reserved,
 * evidence-based meaning (`Domain.VisitorContactDetailAssessment`'s own remarks hold the two apart
 * deliberately; `ContactDetailsPanel` renders `assessment`, never `verified`, for exactly that
 * reason).
 */
export interface ContactDetailDto {
  id: string;
  kind: string;
  value: string;
  recordedByOperatorId: string | null;
  source: string;
  verified: boolean;
  recordedAt: string;
  /** `23-11`/`decisions.md` §5: `true` on the list read when the site's own contact-visibility rung
   * is `MaskedWithReveal` - `value` is then a masked string, never the real one
   * (`ListVisitorContactDetailsHandler`'s own remarks: the masking happens in the read model, never in
   * the console). `false` on the list read (`Visible` rung), on the edit/assessment/reveal responses -
   * a caller of any of those already has the real value in hand. */
  masked: boolean;
  /** `25-58`: `"Unset"` | `"Confirmed"` | `"Invalid"` - always `"Unset"` for an `Other` row (that kind
   * never supports the action at all). */
  assessment: string;
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

/** `25-58`: `PATCH /api/v1/conversations/{id}/contact-details/{id}` - an operator's own correction to
 * an existing row's own value, gated server-side on `conversation:send`
 * (`EditVisitorContactDetailHandler`'s own remarks: the same permission recording one used to need).
 * `source`/`recordedByOperatorId` are never sent - the server keeps them exactly as they were
 * (`VisitorContactDetail.EditValue`'s own remarks: an edit corrects the fact, never reassigns who
 * reported it). */
export async function editContactDetail(
  accessToken: string,
  conversationId: string,
  contactDetailId: string,
  value: string,
): Promise<ContactDetailDto> {
  const response = await fetch(`${url(conversationId)}/${contactDetailId}`, {
    method: "PATCH",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as ContactDetailDto;
}

/** `25-58`: `PATCH /api/v1/conversations/{id}/contact-details/{id}/assessment` - an operator confirms
 * or marks invalid an existing Phone/Email row, gated server-side on `conversation:send`. `assessment`
 * is the wire name of a `Domain.VisitorContactDetailAssessment` member - `"Confirmed"` or `"Invalid"`,
 * never `"Unset"` (`SetVisitorContactDetailAssessmentHandler`'s own remarks: that is not a settable
 * target). The server refuses this for an `Other` row - see that handler's own remarks. */
export async function setContactDetailAssessment(
  accessToken: string,
  conversationId: string,
  contactDetailId: string,
  assessment: "Confirmed" | "Invalid",
): Promise<ContactDetailDto> {
  const response = await fetch(`${url(conversationId)}/${contactDetailId}/assessment`, {
    method: "PATCH",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ assessment }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as ContactDetailDto;
}

/** `23-11`: `POST /api/v1/conversations/{id}/contact-details/{id}/reveal` - one contact detail, one
 * reveal, one record on the server (`RevealVisitorContactDetailHandler`'s own remarks). Gated
 * server-side on `conversation:read`, the same permission the list read already needs - a reveal is
 * not a stronger capability than reading the conversation, it is that same capability applied to one
 * field the tenant's own setting chose to mask by default. */
export async function revealContactDetail(
  accessToken: string,
  conversationId: string,
  contactDetailId: string,
): Promise<ContactDetailDto> {
  const response = await fetch(`${url(conversationId)}/${contactDetailId}/reveal`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as ContactDetailDto;
}
