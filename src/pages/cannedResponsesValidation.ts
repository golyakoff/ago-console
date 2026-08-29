import type { CannedResponseDto } from "../api/cannedResponsesApi.js";
import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** Mirrors `Ago.Chat.Domain.CannedResponse.MaxCount`. */
export const MAX_RESPONSES = 50;

/** Mirrors `Ago.Chat.Domain.CannedResponse.MaxTitleLength`. */
export const MAX_TITLE_LENGTH = 100;

/** Mirrors `Ago.Chat.Domain.CannedResponse.MaxBodyLength` (itself `MessageBody.MaxLength`). */
export const MAX_BODY_LENGTH = 8000;

export interface DraftResponse {
  title: string;
  body: string;
}

/**
 * `18-03`: the same UX-only posture `offlineAutoReplyValidation.ts` states for its own check - this
 * catches the obvious mistakes before a round trip, and `UpdateCannedResponsesHandler` (`ago-chat`)
 * remains the real, authoritative gate. A problem this misses is simply rejected by the server, whose
 * `detail` text the page surfaces unchanged.
 *
 * A row whose title *and* body are both blank is dropped rather than reported, for the identical
 * reason `offlineAutoReplyValidation.ts` gives: the editor always keeps one empty row at the bottom to
 * type into.
 *
 * `strings` defaults to `en` rather than calling `useStrings()` - this runs from a submit handler, not
 * from render, so it has no hook context (`autoReplyValidation.ts`'s own precedent).
 *
 * @returns the first problem found, or `null` when the draft looks sendable.
 */
export function validateDraft(responses: readonly DraftResponse[], strings: ConsoleStrings = en): string | null {
  const meaningful = meaningfulResponses(responses);
  if (meaningful.length > MAX_RESPONSES) {
    return `${strings.cannedResponsesValidationTooManyPrefix} ${MAX_RESPONSES} ${strings.cannedResponsesValidationTooManySuffix}`;
  }

  for (const response of meaningful) {
    if (response.title.trim().length === 0) {
      return strings.cannedResponsesValidationTitleRequired;
    }

    if (response.body.trim().length === 0) {
      return `${strings.cannedResponsesValidationBodyRequiredPrefix}${response.title.trim()}${strings.cannedResponsesValidationBodyRequiredSuffix}`;
    }

    if (response.title.trim().length > MAX_TITLE_LENGTH) {
      return `${strings.cannedResponsesValidationTitleTooLongPrefix} ${MAX_TITLE_LENGTH} ${strings.cannedResponsesValidationTitleTooLongSuffix}`;
    }

    if (response.body.length > MAX_BODY_LENGTH) {
      return `${strings.cannedResponsesValidationBodyTooLongPrefix} ${MAX_BODY_LENGTH} ${strings.cannedResponsesValidationBodyTooLongSuffix}`;
    }
  }

  return null;
}

/** Everything but the wholly-blank rows the editor keeps around for typing into. */
export function meaningfulResponses(responses: readonly DraftResponse[]): DraftResponse[] {
  return responses.filter((r) => r.title.trim().length > 0 || r.body.trim().length > 0);
}

/** The request body: trimmed titles (the server trims too), blank rows dropped. Unlike
 * `toRequestRules`'s own remarks for the auto-reply screen, order carries no behaviour here - nothing
 * matches against this list - but it is preserved anyway because it is still the order the operator
 * arranged the picker will show. */
export function toRequestResponses(responses: readonly DraftResponse[]): CannedResponseDto[] {
  return meaningfulResponses(responses).map((r) => ({ title: r.title.trim(), body: r.body }));
}
