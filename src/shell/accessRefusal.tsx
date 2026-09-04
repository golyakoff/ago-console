import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHead } from "./AppShell.js";
import { Alert } from "../components/Alert.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-24`, decision §10: the one place every "you cannot be here" branch for a gate a colleague at
 * this tenant could plausibly grant now lives - `site:configure` (eleven screens), `site:erase`
 * (one) and, through {@link "../calendar/calendarAccess.js".CalendarAccessRefusal}, the "forbidden"
 * half of `calendar:configure` (`23-21`'s own precedent, generalised here rather than copied a
 * second time). Before this item each of those fourteen screens hand-copied the identical
 * `PageHead` + `Alert tone="danger"` + "Back to queue" block, naming only "you do not have
 * permission" with no next step - `docs/backlog/23-24-*.md`'s own Scope calls that out: "extended to
 * name each capability rather than a second hand-written block per gate".
 *
 * <b>Built from the existing eleven components, not a twelfth</b> (`adr/0030`): `PageHead`, `Alert`,
 * `Link`, the same three `CalendarAccessRefusal` already used.
 *
 * <b>`tone="info"`, not `"danger"`.</b> Every one of the fourteen call sites this replaces used
 * `"danger"` before this item, one of them (`AdminConversationsPage`'s own former comment) citing an
 * accessibility floor for the assertive `role="alert"` that tone carries. Decision §10 changes the
 * premise that comment relied on: a colleague who lacks a permission a colleague *could* grant them
 * is an ordinary, expected state - a new hire, a different role - not a fault the operator caused,
 * and `CalendarAccessRefusal` already reached the identical conclusion for the calendar
 * (`23-21`'s own doc comment: "deliberately non-alarming"). `role="status"` (polite) is what `Alert
 * tone="info"` renders instead - the loss of the assertive announcement is deliberate, not
 * accidental, and is this item's own judgement call, recorded here rather than left silent.
 *
 * <b>`message` names the capability</b>: every caller passes its own already-existing
 * `*Forbidden`/`*ForbiddenError` string (`adminForbidden`, `widgetForbidden`, `analyticsForbiddenError`,
 * and so on) - those sentences already say what the screen is, this component adds only the shared
 * "who can grant it" sentence (`accessRefusalGrantHint`) and the shared chrome around it, exactly the
 * split `CalendarAccessRefusal`'s own `forbiddenMessage` prop already established.
 *
 * `children` exists only for {@link "../calendar/calendarAccess.js".CalendarAccessRefusal}'s own
 * `showElsewhereNotice` case - the one caller that has more to say between the alert and the back
 * link. No other consumer needs it.
 */
export function AccessRefusal({
  title,
  message,
  strings,
  children,
}: {
  title: string;
  message: string;
  strings: ConsoleStrings;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHead title={title} />
      <Alert tone="info">
        {message} {strings.accessRefusalGrantHint}
      </Alert>
      {children}
      <p>
        <Link to="/">{strings.siteConfigBackToQueue}</Link>
      </p>
    </>
  );
}
