/**
 * `23-57`: the three day-to-day booking actions the seeded Operator role holds without
 * `calendar:configure` (`adr/0093`/`ago-chat`'s own `RegisterSiteHandler.OperatorRolePermissions`).
 * Holding any one of the three is enough - `CalendarQueuePage`'s own row actions are Reject/Cancel/
 * Mark no-show, not one bundled "queue" permission, and an operator can hold a real subset of them
 * (nothing here should assume the seeded bundle is the only shape this ever takes).
 *
 * Shared between `consoleNav.ts` (decides whether to draw the Waiting entry at all) and
 * `CalendarQueuePage` (decides whether to render the queue instead of refusing) on purpose: this
 * item exists precisely because a nav entry and the screen it points at had drifted apart once
 * already (`docs/backlog/23-57-*.md`) - `calendar:configure` promised more than the page could
 * deliver for the roles that actually work day to day. Two independent copies of the same
 * three-permission check would only reopen that seam from the other side, so both call sites read
 * this one function instead.
 *
 * A plain `.ts` module, not folded into `calendar/calendarAccess.tsx`: that file exports a component
 * (`CalendarAccessRefusal`), and `react-refresh/only-export-components` refuses a file that mixes a
 * component export with a plain-function one - the lint rule that caught this the first time this
 * function was placed there.
 */
export function hasAnyBookingActionPermission(hasPermission: (permission: string) => boolean): boolean {
  return (
    hasPermission("booking:confirm") || hasPermission("booking:reject") || hasPermission("booking:cancel")
  );
}
