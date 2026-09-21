import { localizedEmojiName } from "../i18n/visitorEmojiNames.js";

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
  return hasEmojiPair(visitor) ? `${visitor.emojiCreature}${visitor.emojiFood} ` : "";
}

/**
 * `25-207`: the one "is there really a pair here" check, shared by `visitorEmojiPrefix` above (the
 * pre-existing text contract) and `VisitorAvatar.tsx`'s badge composition (the new visual one) - both
 * need the identical "both halves or neither" rule this file's own top doc comment already gives, and
 * a call site should never restate a boolean condition a shared helper already owns.
 */
export function hasEmojiPair(visitor: {
  emojiCreature?: string | null;
  emojiFood?: string | null;
}): visitor is { emojiCreature: string; emojiFood: string } {
  return Boolean(visitor.emojiCreature && visitor.emojiFood);
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

/**
 * `25-162`: the name-or-nothing half of `visitorDisplayPrefix`, split out so a render site can give
 * the emoji pair its own, deliberately larger element (`25-207`'s `VisitorAvatar`, the badge
 * composition that replaced this item's original `.ago-visitor-emoji` span) while the name stays
 * plain text at the surrounding size. `visitorDisplayPrefix` itself is unchanged, still the single
 * combined string for a caller with no reason to style the two halves differently (its own
 * pre-existing test coverage).
 */
export function visitorNameSuffix(visitor: { visitorName?: string | null }): string {
  const name = visitor.visitorName?.trim();
  return name ? `${name} ` : "";
}

/**
 * `25-207`: the fallback half of this item's own Scope - "when `visitorName` is absent, the fallback
 * label becomes each emoji's own localized name" - `Сова · Клубника` rather than the bare glyphs.
 * `names` is `ConsoleStrings.visitorEmojiNames` for whatever locale is active, passed in rather than
 * read from a hook here because this file stays a plain function module - no React import, so it
 * keeps its own pre-existing unit tests (`visitorEmoji.test.ts`) free of a component-testing harness.
 *
 * Renders nothing (not `" · "`, not a lone `·`) when the pair itself is absent - `hasEmojiPair`'s
 * same "both halves or neither" rule, so a visitor from before `25-56` shipped renders identically to
 * before this item existed, exactly as `visitorEmojiPrefix` already does for the avatar's own glyphs.
 */
export function visitorFallbackLabel(
  visitor: { emojiCreature?: string | null; emojiFood?: string | null },
  names: Readonly<Record<string, string>>,
): string {
  if (!hasEmojiPair(visitor)) {
    return "";
  }
  return `${localizedEmojiName(visitor.emojiCreature, names)} · ${localizedEmojiName(visitor.emojiFood, names)} `;
}

/**
 * `25-207`'s own call-site function: the label a render site puts beside `VisitorAvatar`, before the
 * short code. Reuses `visitorNameSuffix` unchanged for the "a real name is known" branch - this
 * item's own Scope requires that branch's behaviour stay "provably unchanged", which reusing the
 * existing, already-tested function (rather than reimplementing its trim/blank handling here) is what
 * actually proves rather than merely asserts. Only when that returns empty (no real name, the exact
 * condition `visitorNameSuffix` already centralises) does this fall through to the localized pair
 * label above - so a visitor with neither a name nor a pair still renders "", the pre-existing case.
 */
export function visitorLabel(
  visitor: { emojiCreature?: string | null; emojiFood?: string | null; visitorName?: string | null },
  names: Readonly<Record<string, string>>,
): string {
  const nameSuffix = visitorNameSuffix(visitor);
  return nameSuffix || visitorFallbackLabel(visitor, names);
}
