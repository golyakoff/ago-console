/**
 * `25-56`: the visitor's emoji-pair identity, and (this item's own second half) their own name when
 * known - one memory aid, rendered in exactly two places (`ConversationList.tsx`'s two list variants,
 * `ConversationPage.tsx`'s open-dialog header) and nowhere else: not beside a per-message "who wrote
 * this" label in the transcript, not in the widget (a different repository, and visitor-facing
 * regardless). Both call sites prepend this to whatever they already render for the short code - it
 * never replaces it.
 *
 * `ConversationSummaryDto.emojiCreature`/`emojiFood` are nullable on the wire even though every
 * visitor a real caller observes has both, because the guarantee is enforced by the two creation call
 * sites, not a schema constraint (`Ago.Chat.Domain.Visitor`'s own remarks) - a row from a server that
 * predates the column, or an in-flight write, is still a real case this renders through. Handled here
 * once, the same "absent is a real case, not an error" shape `attention.ts`/`AttachmentUploadGrantToggle`
 * already give the other nullable fields on this DTO: render nothing extra rather than half a pair.
 */
export function visitorEmojiPrefix(visitor: { emojiCreature?: string | null; emojiFood?: string | null }): string {
  return visitor.emojiCreature && visitor.emojiFood ? `${visitor.emojiCreature}${visitor.emojiFood} ` : "";
}

/**
 * `25-56`'s own second half: the item's own Scope section names the full format
 * `{emoji}{emoji} {name-if-known} {short-code}` - this builds everything before the short code, so
 * every call site still owns exactly one thing, appending `visitorId.slice(0, 8)`.
 *
 * `visitorName` is trimmed and treated as absent when blank, the same "a caller predating the field
 * looks identical to one that answered with nothing" reasoning `visitorEmojiPrefix` above already
 * gives the emoji pair - a defensive normalisation, not an expectation that the wire ever actually
 * sends whitespace (`Ago.Chat.Domain.VisitorContactDetail.Record`/`RecordFromVisitor` already trim and
 * reject an empty value before a row can exist at all).
 *
 * No case joins the emoji pair's own absence with a present name into a leading-space artifact:
 * `visitorEmojiPrefix` already ends with its own trailing space only when both halves are present, and
 * this simply appends `name + " "` after it, so a pair-less visitor with a name reads as `name ` (no
 * leading space) and a name-less visitor with a pair reads as `visitorEmojiPrefix`'s own output,
 * unchanged - the case the console shipped before this item existed.
 */
export function visitorDisplayPrefix(visitor: {
  emojiCreature?: string | null;
  emojiFood?: string | null;
  visitorName?: string | null;
}): string {
  const name = visitor.visitorName?.trim();
  return name ? `${visitorEmojiPrefix(visitor)}${name} ` : visitorEmojiPrefix(visitor);
}
