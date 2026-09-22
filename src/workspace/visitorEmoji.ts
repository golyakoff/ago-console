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

/**
 * `26-31`: what a *queue row* puts beside the avatar, now that the row no longer prints the visitor's
 * short code after it.
 *
 * The code used to be unconditional - `{visitorLabel(...)}<span class="ago-visitor-shortcode">
 * {c.visitorId.slice(0, 8)}</span>` in both of `ConversationList`'s sections. Since `25-207` gave
 * `visitorLabel` above a real human label in every case a pair exists (the visitor's own name, else
 * «Сова · Клубника»), that code was a second identity standing beside a perfectly good first one, on
 * a screen whose whole job is scanning many rows quickly. The author asked for it to go from every
 * surface that shows it.
 *
 * **But not from the one row that has nothing else.** `visitorLabel` returns `""` for a visitor with
 * neither a name nor an emoji pair - a row predating `25-56`'s backfill, or an in-flight write, which
 * this file's own top doc comment already insists is a real case rather than an error. Removing the
 * code unconditionally would leave that row's badge blank, which is strictly worse than hex. So the
 * code survives exactly there, as a fallback, and the rule lives here rather than as a ternary at two
 * call sites.
 *
 * Trimmed, unlike `visitorLabel`'s own trailing-space contract: that space existed to separate the
 * label from the code that used to follow it, and nothing follows it any more.
 *
 * `ConversationPage.tsx` deliberately keeps its own short code and does not call this. The open
 * conversation is where an operator quotes an id into a support ticket or a log search, which is the
 * opposite of this screen's "scan many rows fast" job.
 */
export function visitorQueueRowLabel(
  visitor: { emojiCreature?: string | null; emojiFood?: string | null; visitorName?: string | null; visitorId: string },
  names: Readonly<Record<string, string>>,
): string {
  return visitorLabel(visitor, names).trim() || visitor.visitorId.slice(0, 8);
}
