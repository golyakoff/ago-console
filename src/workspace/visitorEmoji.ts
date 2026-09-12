/**
 * `25-56`: the visitor's emoji-pair identity - one memory aid, rendered in exactly two places
 * (`ConversationList.tsx`'s two list variants, `ConversationPage.tsx`'s open-dialog header) and
 * nowhere else: not beside a per-message "who wrote this" label in the transcript, not in the widget
 * (a different repository, and visitor-facing regardless). Both call sites prepend this to whatever
 * they already render for the short code - it never replaces it.
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
