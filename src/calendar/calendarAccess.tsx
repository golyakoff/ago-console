import { Link } from "react-router-dom";
import { usePermissions } from "../auth/PermissionsContext.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { CalendarElsewhereNotice } from "./CalendarElsewhereNotice.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-21`: the one place every calendar screen's "you cannot be here" branch lives now, replacing
 * seven hand-copied `PageHead` + `Alert tone="danger"` + "Back to queue" blocks - one per moved
 * screen (`CalendarQueuePage`, `CalendarSetupPage`, `CalendarWorkersPage`,
 * `CalendarWorkerSlotsPage`, `CalendarWorkerRecutPage`, `CalendarAvailabilityPage`,
 * `CalendarContactsPage`). `docs/backlog/23-21-*.md`'s own Scope calls this out by name: "one shared
 * treatment, not the current per-screen copy."
 *
 * <b>Built from the existing eleven components, not a twelfth</b> (`adr/0030`): `PageHead`, `Alert`,
 * `Link`, all already used by the blocks this replaces. A genuinely new visual idiom (a tone between
 * `danger` and `success`, `gaps.md` pile 3 item 2) would have been tempting for the "non-alarming"
 * requirement below - not taken, because that decision belongs to the author, not to this item.
 *
 * `23-24`: the "forbidden" branch below now renders through `src/shell/accessRefusal.tsx`'s shared
 * `AccessRefusal` rather than its own copy of the same `PageHead`+`Alert`+`Link` shape -
 * `docs/backlog/23-24-*.md`'s own words are "generalising... rather than inventing a second version
 * of" this component. Only the "absent" branch stays local: it is the one state none of the other
 * thirteen gates `23-24` touches has at all (`site:configure`/`site:erase` are never "the tenant does
 * not have this capability"), so there is nothing to share it with.
 *
 * <b>Two states, never merged, matching `GetMyPermissionsHandler`'s own response shape.</b> Before
 * this item every one of these seven screens asked exactly one question - `hasPermission
 * ("calendar:configure")` - and gave exactly one answer to two different people: an operator whose
 * tenant has the calendar and simply has not been granted it, and an operator whose tenant has never
 * switched the calendar on at all. `flows.md` 4.3 names that indistinguishability its own
 * must-never-happen, generalising `22-14`'s finding for the tenancy switcher to every gated screen.
 * `enabledModules` (`GET /api/v1/operators/me`, `23-21`'s own widened response) is what tells the two
 * apart:
 *
 * - <b>`"forbidden"`</b> - the tenant's own `EnabledModule` row for `"calendar"` exists, this operator
 *   just does not hold `calendar:configure`. Deliberately non-alarming (`tone="info"`, never
 *   `"danger"`): this is an ordinary, expected state for a new hire or a colleague in a different
 *   role, not a fault. Names who can fix it (`accessRefusalGrantHint`, via `AccessRefusal` - an
 *   owner or admin at this workspace), because a refusal with no next step is barely better than
 *   silence
 *   (`docs/backlog/23-21-*.md`'s own framing). `/calendar` alone also adds
 *   {@link CalendarElsewhereNotice} beneath it, unchanged from `22-14` - see that component's own
 *   doc comment for why it is mounted nowhere else.
 * - <b>`"absent"`</b> - this tenant has no `"calendar"` row at all. Saying "you do not have
 *   permission" here would be true of literally every operator on this deployment, which is not a
 *   fact about the person reading it - `calendarAbsentForTenant` says what is actually true instead,
 *   and names where the capability comes from (switched on per workspace, not by an operator) without
 *   inventing a self-service path this product does not have yet (`flows.md` 5.2 - `not planned`).
 *
 * <b>Deliberately not called from the nav decision itself.</b> `consoleNav.ts` uses the identical
 * `enabledModules` fact for a different purpose - whether to draw a nav entry at all - which is a
 * disclosure decision (`flows.md` 4.3's own "usually the wrong one" warning about "nothing"), not a
 * refusal to render. Keeping the two separate means a stale bookmark or a shared link still gets an
 * honest answer even though the nav itself stayed silent about the "absent" case.
 */
export function CalendarAccessRefusal({
  title,
  forbiddenMessage,
  strings,
  showElsewhereNotice = false,
}: {
  title: string;
  forbiddenMessage: string;
  strings: ConsoleStrings;
  /** `22-14`: only `/calendar` itself passes `true` - see {@link CalendarElsewhereNotice}'s own doc
   * comment for why it is not repeated on every calendar screen. */
  showElsewhereNotice?: boolean;
}) {
  const { enabledModules } = usePermissions();
  const tenantHasCalendar = enabledModules?.includes("calendar") ?? false;

  if (tenantHasCalendar) {
    return (
      <AccessRefusal title={title} message={forbiddenMessage} strings={strings}>
        {showElsewhereNotice && <CalendarElsewhereNotice />}
      </AccessRefusal>
    );
  }

  return (
    <>
      <PageHead title={title} />
      <Alert tone="info">{strings.calendarAbsentForTenant}</Alert>
      <p>
        <Link to="/">{strings.siteConfigBackToQueue}</Link>
      </p>
    </>
  );
}
