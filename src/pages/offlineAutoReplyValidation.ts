import type { OfflineAutoReplyRuleDto } from "../api/offlineAutoReplyApi.js";

/** Mirrors `Ago.Chat.Domain.OfflineAutoReplySettings.MaxRules`. */
export const MAX_RULES = 20;

/** Mirrors `Ago.Chat.Domain.OfflineAutoReplyRule.MaxKeywordLength`. */
export const MAX_KEYWORD_LENGTH = 64;

/** Mirrors `Ago.Chat.Domain.OfflineAutoReplyRule.MaxReplyLength`, which also bounds the fallback. */
export const MAX_REPLY_LENGTH = 1000;

export interface DraftRule {
  keyword: string;
  reply: string;
}

/**
 * `14-04`: the same UX-only posture `widgetConfigValidation.ts` states for its own hex check - this
 * catches the obvious mistakes before a round trip, and `UpdateOfflineAutoReplyHandler` remains the
 * real, authoritative gate. A rule this misses is simply rejected by the server, whose `detail` text
 * the page surfaces unchanged.
 *
 * <p>One rule here is worth stating because it is easy to read as a quirk: a rule whose keyword
 * <em>and</em> reply are both blank is dropped rather than reported. The editor always keeps one
 * empty row at the bottom to type into, so treating a wholly-untouched row as an error would make
 * the form permanently invalid.</p>
 *
 * @returns the first problem found, or `null` when the draft looks sendable.
 */
export function validateDraft(enabled: boolean, fallbackReply: string, rules: readonly DraftRule[]): string | null {
  const trimmedFallback = fallbackReply.trim();

  if (enabled && trimmedFallback.length === 0) {
    return "An enabled auto-reply needs something to say - fill in the default reply.";
  }

  if (trimmedFallback.length > MAX_REPLY_LENGTH) {
    return `The default reply cannot exceed ${MAX_REPLY_LENGTH} characters.`;
  }

  const meaningful = meaningfulRules(rules);
  if (meaningful.length > MAX_RULES) {
    return `A site cannot have more than ${MAX_RULES} keyword rules.`;
  }

  for (const rule of meaningful) {
    if (rule.keyword.trim().length === 0) {
      return "A keyword rule needs a keyword.";
    }

    if (rule.reply.trim().length === 0) {
      return `The rule for "${rule.keyword.trim()}" needs a reply.`;
    }

    if (rule.keyword.trim().length > MAX_KEYWORD_LENGTH) {
      return `A keyword cannot exceed ${MAX_KEYWORD_LENGTH} characters.`;
    }

    if (rule.reply.length > MAX_REPLY_LENGTH) {
      return `A reply cannot exceed ${MAX_REPLY_LENGTH} characters.`;
    }
  }

  return null;
}

/** Everything but the wholly-blank rows the editor keeps around for typing into. */
export function meaningfulRules(rules: readonly DraftRule[]): DraftRule[] {
  return rules.filter((rule) => rule.keyword.trim().length > 0 || rule.reply.trim().length > 0);
}

/** The request body: trimmed keywords (the server trims too), blank rows dropped, order preserved -
 * the server matches first-rule-wins, so the order the operator arranged is the behaviour. */
export function toRequestRules(rules: readonly DraftRule[]): OfflineAutoReplyRuleDto[] {
  return meaningfulRules(rules).map((rule) => ({ keyword: rule.keyword.trim(), reply: rule.reply }));
}
