import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `23-69`/`23-77`: `ago-chat`'s `VisitorRestrictionsEndpoints.VisitorRestrictionListItemDto` - one
 * `visitor_restrictions` row, exactly as the tenant's own report needs it (who, when, until when or
 * indefinitely, from which conversation, and whether/when it was lifted).
 */
export interface VisitorRestrictionListItem {
  id: string;
  visitorId: string;
  kind: "Spam" | "Block";
  restrictedAt: string;
  restrictedBy: string;
  expiresAt: string | null;
  sourceConversationId: string;
  liftedAt: string | null;
  liftedBy: string | null;
}

export interface VisitorRestrictionListResult {
  items: VisitorRestrictionListItem[];
  nextBeforeId: string | null;
}

/**
 * `23-69`'s own Done-when: "the tenant can see how many, by whom, and read the conversations
 * themselves." `GET /api/v1/visitor-restrictions` - site-scoped from the operator's own token, the
 * same shape `fetchAllConversationsForSite` already uses, keyset-paginated by `before`/`limit`.
 * `site:configure`-gated server-side (`GetVisitorRestrictionsForSiteHandler`'s own remarks) - the same
 * tenant-wide-oversight placement `/access-records` already uses.
 */
export async function fetchVisitorRestrictions(
  accessToken: string,
  before?: string,
  limit?: number,
): Promise<VisitorRestrictionListResult> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/visitor-restrictions`);
  if (before) {
    url.searchParams.set("before", before);
  }
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as VisitorRestrictionListResult;
}

/**
 * Both items' own reversibility requirement - `POST /api/v1/visitor-restrictions/{visitorId}/lift`,
 * addressed by visitor rather than by conversation (`ago-chat`'s `LiftVisitorRestriction`'s own
 * remarks: this screen may have no particular conversation open at all). `204` on success, the same
 * "nothing to return, the caller already knows what it asked for" contract `closeConversation`
 * already uses. Throws `ApiProblemError` (`Conversation.Forbidden` - the wrong kind of permission for
 * this restriction's own kind - or `Visitor.NotRestricted`, already lifted or naturally expired).
 */
export async function liftVisitorRestriction(accessToken: string, visitorId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/visitor-restrictions/${visitorId}/lift`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return;
  }

  throw await problemDetailsFrom(response);
}
