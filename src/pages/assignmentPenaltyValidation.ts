import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-05`: the same UX-only posture `offlineAutoReplyValidation.ts` states for its own draft -
 * this catches the obvious mistake (zero, negative, not a whole number) before a round trip, and
 * `UpdateAssignmentPenaltyHandler` remains the real, authoritative gate
 * (`Site.UpdateAssignmentPenalty`'s own guard: "must be a positive number of seconds").
 *
 * <p>`strings` defaults to `en`, the same reasoning `validateDraft` states for itself: this runs from
 * a submit handler, not from render, so it has no hook context.</p>
 *
 * @returns the first problem found, or `null` when the draft looks sendable.
 */
export function validatePenaltySeconds(raw: string, strings: ConsoleStrings = en): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return strings.assignmentPenaltyValidationRequired;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return strings.assignmentPenaltyValidationMustBePositive;
  }

  return null;
}
