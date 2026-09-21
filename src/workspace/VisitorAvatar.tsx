import { Fragment } from "react";
import { hasEmojiPair } from "./visitorEmoji.js";

export interface VisitorAvatarProps {
  emojiCreature?: string | null;
  emojiFood?: string | null;
}

/**
 * `25-207`: replaces the two same-size glyphs side by side (`25-56`'s original pair, `25-162`'s
 * `.ago-visitor-emoji` span) with a badge composition, confirmed live against three visual variants
 * before settling on this one (the backlog item's own "What the conversation actually settled" §1) -
 * the creature large and centered, the food a small badge overlapping its bottom-right edge with no
 * background circle of its own, floating directly over whatever surface this sits on.
 *
 * One shared component rather than each of the three call sites (`ConversationList.tsx`'s two rows,
 * `ConversationPage.tsx`'s header) building the same nested-span markup independently: they already
 * shared the *string-building* half of this feature through `visitorEmoji.ts`, and a badge needs real
 * DOM structure (a positioned element, not a string of two adjacent characters) to get the same
 * guarantee - one place decides what the composition looks like, so the three call sites cannot drift
 * the way three independent copies eventually do.
 *
 * `aria-hidden`: the visible text label beside this (`visitorLabel`, `visitorEmoji.ts`) already carries
 * the same information as words - either the visitor's real name, or (`25-207`'s own addition) the
 * localized `{creature} · {food}` name - so a screen reader announcing this element's own emoji glyphs
 * on top of that would be a redundant, unlabelled repetition rather than a second fact.
 *
 * Renders nothing - not even a trailing space - when the pair itself is absent - `hasEmojiPair`'s
 * pre-existing "both halves or neither" rule (`visitorEmoji.ts`'s own top doc comment), unchanged by
 * this item: a visitor from before `25-56` shipped, or an in-flight write, still renders through with
 * no badge rather than half of one. The trailing space when a pair *is* present is rendered as part of
 * this component, not left to whatever text follows it, for the identical reason `visitorEmojiPrefix`
 * has always owned its own trailing space (`visitorEmoji.ts`'s own doc comment): a call site should
 * never have to know whether the thing before it rendered anything in order to decide whether it also
 * needs to supply a separating space.
 */
export function VisitorAvatar({ emojiCreature, emojiFood }: VisitorAvatarProps) {
  if (!hasEmojiPair({ emojiCreature, emojiFood })) {
    return null;
  }

  return (
    <Fragment>
      <span className="ago-visitor-avatar" aria-hidden="true">
        <span className="ago-visitor-avatar__creature">{emojiCreature}</span>
        <span className="ago-visitor-avatar__food">{emojiFood}</span>
      </span>{" "}
    </Fragment>
  );
}
