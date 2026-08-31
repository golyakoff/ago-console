import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

const TRIGGER_WORD_SPLIT_PATTERN = /[,\n]+/;

/** Splits the trigger-words field's raw text into the array `ModuleConfigDto.triggerWords` expects -
 * comma- or newline-separated, each entry trimmed, blank entries dropped. UX convenience only: what a
 * server-side module-registration handler actually accepts for a trigger word (length, character set)
 * is that handler's own rule to enforce, the same "client mirrors the obvious case, server is the
 * real gate" posture `widgetConfigValidation.ts`'s own doc comments state for their fields. */
export function parseTriggerWords(input: string): string[] {
  return input
    .split(TRIGGER_WORD_SPLIT_PATTERN)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

/**
 * `19-03`: an entry point is fetched *by the server* - `Ago.Chat.Api` calls it to run the module's
 * own `start`/`reply` endpoints (`adr/0065`) - so this is the same kind of URL `6-03`'s webhook
 * registration is, not the kind `isValidNoticeUrl` (`widgetConfigValidation.ts`) is: a notice URL is
 * only ever opened in the visitor's own browser, which is why that check stops at "https and
 * well-formed" and leaves SSRF/private-range rejection to nobody. An entry point the server itself
 * dereferences needs that harder check too, and this file does not attempt it - `https://`-and-
 * well-formed is the same UX-only floor every other client-side check in this console keeps to, and
 * `Ago.Chat.Api`'s own module-registration handler is the real, authoritative gate a private-range or
 * malformed entry point is rejected by, not this function.
 */
export function isValidEntryPointUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The module-registration form's full-draft check, run from the submit handler - the same "pure
 * function, `strings: ConsoleStrings = en` parameter" shape `offlineAutoReplyValidation.ts`'s own
 * `validateDraft` uses, for the identical reason (no hook context outside render).
 *
 * @returns the first problem found, or `null` when the draft looks sendable.
 */
export function validateModuleDraft(
  moduleKey: string,
  triggerWords: readonly string[],
  entryPoint: string,
  strings: ConsoleStrings = en,
): string | null {
  if (moduleKey.trim().length === 0) {
    return strings.faqModuleKeyValidationRequired;
  }

  if (triggerWords.length === 0) {
    return strings.faqTriggerWordsValidationRequired;
  }

  if (entryPoint.trim().length === 0) {
    return strings.faqEntryPointValidationRequired;
  }

  if (!isValidEntryPointUrl(entryPoint.trim())) {
    return strings.faqEntryPointValidationInvalid;
  }

  return null;
}
