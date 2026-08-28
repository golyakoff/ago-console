import type { OfflineAutoReplyRuleDto } from "../api/offlineAutoReplyApi.js";
import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

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
/**
 * `11-13`: `strings` is a parameter defaulted to `en` rather than a `useStrings()` call inside this
 * function - the same reasoning `closeOutcomeFor`/`shortcutDescription` (`11-12`) already state for
 * their own pure functions: this runs from `OfflineAutoReplyPage`'s submit handler, not from render,
 * so it has no hook context. Defaulting to `en` keeps `offlineAutoReplyValidation.test.ts`'s existing
 * two/three-argument call sites - which assert the English sentences on purpose - green without
 * editing a test file this item has no reason to touch.
 */
export function validateDraft(
  enabled: boolean,
  fallbackReply: string,
  rules: readonly DraftRule[],
  strings: ConsoleStrings = en,
): string | null {
  const trimmedFallback = fallbackReply.trim();

  if (enabled && trimmedFallback.length === 0) {
    return strings.autoReplyValidationNeedsDefault;
  }

  if (trimmedFallback.length > MAX_REPLY_LENGTH) {
    return `${strings.autoReplyValidationDefaultTooLongPrefix} ${MAX_REPLY_LENGTH} ${strings.autoReplyValidationDefaultTooLongSuffix}`;
  }

  const meaningful = meaningfulRules(rules);
  if (meaningful.length > MAX_RULES) {
    return `${strings.autoReplyValidationTooManyRulesPrefix} ${MAX_RULES} ${strings.autoReplyValidationTooManyRulesSuffix}`;
  }

  for (const rule of meaningful) {
    if (rule.keyword.trim().length === 0) {
      return strings.autoReplyValidationKeywordRequired;
    }

    if (rule.reply.trim().length === 0) {
      return `${strings.autoReplyValidationReplyRequiredPrefix}${rule.keyword.trim()}${strings.autoReplyValidationReplyRequiredSuffix}`;
    }

    if (rule.keyword.trim().length > MAX_KEYWORD_LENGTH) {
      return `${strings.autoReplyValidationKeywordTooLongPrefix} ${MAX_KEYWORD_LENGTH} ${strings.autoReplyValidationKeywordTooLongSuffix}`;
    }

    if (rule.reply.length > MAX_REPLY_LENGTH) {
      return `${strings.autoReplyValidationReplyTooLongPrefix} ${MAX_REPLY_LENGTH} ${strings.autoReplyValidationReplyTooLongSuffix}`;
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
