import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-118`: the chat-side twin of `calendarErrorMessage`'s own `shape.mismatch` branch.
 *
 * `23-41` chose validation at every API boundary as the standard and `23-99` built the mechanism
 * (`api/shapeGuard.ts`); the calendar readers already surface a rejected shape through
 * `calendarErrorMessage`, but the chat readers throw `problemDetails.ts`'s `ApiProblemError` (and the
 * two bespoke `code`-carrying errors, `CannedResponsesError`/`ReplyDraftError`), which every consuming
 * screen renders by its own `.message` on the load path. This function is what turns that one code into
 * a localized sentence, so a chat reader's `shape.mismatch` reads as an honest "not the expected shape"
 * rather than as the raw endpoint+field diagnostic (`ShapeMismatchError.diagnostic`, carried through as
 * the error's `message`).
 *
 * <b>Duck-typed on `code`, deliberately.</b> The three chat error classes that carry `shape.mismatch`
 * (`ApiProblemError`, `CannedResponsesError`, `ReplyDraftError`) share no common base beyond `Error` -
 * folding them under one would be a premature abstraction this file has no need for. A `code` of
 * `"shape.mismatch"` on any `Error` is the whole contract, exactly the string every guarded reader
 * rethrows.
 *
 * <b>Returns `null`, not a fallback.</b> A caller keeps its own existing "unknown failure" wording
 * (`strings.adminLoadError`, `err.message`, a session-expiry redirect) and reaches for this only for
 * the one code it localizes - `shapeMismatchMessage(err, strings) ?? <existing expression>` - so this
 * never widens what a screen already does for every other failure.
 */
function isShapeMismatch(reason: unknown): reason is Error & { code: string } {
  return (
    reason instanceof Error &&
    "code" in reason &&
    (reason as { code?: unknown }).code === "shape.mismatch"
  );
}

export function shapeMismatchMessage(reason: unknown, strings: ConsoleStrings): string | null {
  // The neutral endpoint+field diagnostic, not an English sentence - `shapeMismatchError` is the
  // localized frame, the diagnostic (a URL and wire field names) is appended in parens so a report can
  // name which endpoint and field disagreed, the identical shape `calendarErrorMessage` uses.
  return isShapeMismatch(reason) ? `${strings.shapeMismatchError} (${reason.message})` : null;
}
