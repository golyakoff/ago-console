import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `23-69`/`23-77`: `ago-chat`'s `VisitorRestrictionsEndpoints.VisitorRestrictionListItemDto` - one
 * `visitor_restrictions` row, exactly as the tenant's own report needs it (who, when, until when or
 * indefinitely, from which conversation, and whether/when it was lifted).
 *
 * `emojiCreature`/`emojiFood` (`26-202`, `ago-chat` PR #372): the same nullable emoji-pair fields
 * `ConversationSummaryDto` already carries, added here so `26-204` can replace the bare short id this
 * screen used to show with `visitorLabelWithShortId`'s own label - no `visitorName` field exists on
 * this DTO (the restriction is keyed by visitor id, not by the visitor's own contact detail), so the
 * label falls through to the localized pair, or the bare short id when even that is absent, exactly as
 * `visitorLabel`'s own "both halves or neither" contract already handles.
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
  emojiCreature?: string | null;
  emojiFood?: string | null;
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
/**
 * `23-118`/`23-99`: the runtime shapes this read promises. This is a list screen ("how many, by whom");
 * a dropped `items` renders as "no restrictions" indistinguishable from a site with none (the `23-99`
 * false-empty case), and each row is checked, since a row missing `restrictedBy`/`restrictedAt` renders
 * with blank columns. `emojiCreature`/`emojiFood` are the two genuinely optional fields on the row
 * (`?`, `26-202`) - `requiredKeysOf` excludes them, so a body from before that field existed still
 * validates. `liftVisitorRestriction` is a write returning `void`, out of scope per the bound.
 */
const visitorRestrictionListResultRequiredKeys = requiredKeysOf<VisitorRestrictionListResult>({
  items: true,
  nextBeforeId: true,
});
const visitorRestrictionItemRequiredKeys = requiredKeysOf<VisitorRestrictionListItem>({
  id: true,
  visitorId: true,
  kind: true,
  restrictedAt: true,
  restrictedBy: true,
  expiresAt: true,
  sourceConversationId: true,
  liftedAt: true,
  liftedBy: true,
});

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

  const body: unknown = await response.json();
  try {
    assertHasKeys<VisitorRestrictionListResult>(
      body,
      visitorRestrictionListResultRequiredKeys,
      "GET /api/v1/visitor-restrictions",
    );
    assertArrayHasKeys<VisitorRestrictionListItem>(
      body.items,
      visitorRestrictionItemRequiredKeys,
      "GET /api/v1/visitor-restrictions (items)",
    );
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      // Rethrown as `ApiProblemError` (`shape.mismatch`), the same type this reader's failure path
      // already throws - `RestrictedVisitorsPage`'s load `catch` renders its own localized error.
      throw new ApiProblemError("shape.mismatch", reason.diagnostic, response.status);
    }
    throw reason;
  }
  return body;
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
