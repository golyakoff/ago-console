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
    if (reason.code === "shape.mismatch") {
      // `23-41`: a response that was not the shape the calling reader promised - caught at the API
      // boundary (the chosen reading: validate at every boundary) rather than left to throw during
      // render and blank the screen. The frame is localized; the endpoint+field diagnostic
      // (`reason.message` here is the reader's `ShapeMismatchError.diagnostic` - a URL and wire field
      // names, language-neutral by nature) is appended so a report can name which endpoint and field
      // disagreed. The same "state what is actually known" rule `RenderErrorAlert` follows, never a
      // generic "an unexpected error occurred".
      return `${strings.calendarShapeMismatchError} (${reason.message})`;
    }

    // `26-210`/`adr/0187`: the one reschedule refusal this file gives its own sentence - see
    // `calendarRescheduleSlotUnavailableError`'s own doc comment in `strings.ts` for why
    // `DifferentWorker` and every other reschedule refusal are left to the generic `reason.message`
    // fallthrough below instead (`booking.invalid_state` is shared by both, so they cannot be told
    // apart by code alone, and the item's own instruction is to surface the server's detail for
    // everything but this one named case).
    if (reason.code === "booking.slot_unavailable") {
      return strings.calendarRescheduleSlotUnavailableError;
    }

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
      reason.code === "recut.forbidden" ||
      // `23-34`: `GetConfirmedBookingsForTenantHandler`'s own permission refusal - the identical
      // shape `contacts.forbidden` already has, added here rather than left to fall through to the
      // server's raw `detail` sentence the way every other, un-taught code does.
      reason.code === "confirmed_bookings.forbidden" ||
      // `26-268`§2a/`adr/0188`: `GetPersonCandidatesByPhoneHandler`'s own `customer:read` refusal - the
      // manual-entry dialog's phone-recognition step, gated the same way `contacts.forbidden` already
      // is above.
      reason.code === "person_recognition.forbidden"
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
