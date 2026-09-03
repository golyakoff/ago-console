import { CalendarApiError } from "../api/calendarApi.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `22-06`: what to show an operator when one of the calendar screens' own calls was refused -
 * moved from `ago-calendar-console`'s own `src/pages/errorMessage.ts` unchanged in shape, renamed so
 * a reader browsing `src/pages/` does not mistake it for *the* console's one error mapper. It is not:
 * `Ago.Chat.Api`'s own screens read `ApiProblemError`/`problemDetailsFrom` (`api/problemDetails.ts`)
 * instead, because the two backends define their own, unrelated `type` vocabularies - a shared
 * mapper would have to know both, which is exactly the kind of premature generalisation
 * `clean-architecture.md` warns a platform-shaped file into.
 *
 * <b>The server's own `detail` verbatim</b> for anything this file has not been taught about -
 * `api-design.md`'s rule is that clients branch on `type` and never on the message, and the corollary
 * is that a message the client does not branch on should reach the human unedited rather than be
 * replaced by a generic sentence that loses what actually happened. That is also why this function
 * takes `strings` as a parameter rather than calling `useStrings()` itself: it is a plain function,
 * not a component, called from every calendar screen's own `catch` block.
 *
 * The one code that gets its own sentence is the permission failure, because the server's wording
 * names a permission string an operator has no way to act on.
 */
export function calendarErrorMessage(reason: unknown, strings: ConsoleStrings): string {
  if (reason instanceof CalendarApiError) {
    if (
      // `access.forbidden` was here for the Access screen's own calls - removed alongside it,
      // `22-05` (`adr/0093`) having deleted the `/roles`/`/operators` endpoints that could ever
      // produce it. `ErrorExtensions.cs` on `ago-calendar`'s own `origin/main` still maps the
      // string to 403 (a leftover from before that item), but nothing there constructs it any more -
      // matching it here would be dead code matching dead code.
      reason.code === "configuration.forbidden" ||
      reason.code === "booking.forbidden" ||
      reason.code === "contacts.forbidden" ||
      reason.code === "worker_slots.forbidden" ||
      reason.code === "recut.forbidden"
    ) {
      return strings.calendarPermissionDeniedError;
    }

    return reason.message;
  }

  // A network failure and a CORS refusal are indistinguishable to a page by design: the browser
  // deliberately tells JavaScript nothing about a response it was not allowed to read. Guessing
  // which one it was would be worse than saying neither.
  return strings.calendarNetworkError;
}
