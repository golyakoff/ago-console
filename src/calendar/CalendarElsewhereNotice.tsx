import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { fetchMyCalendarTenancies, type CalendarTenancy } from "../api/calendarTenanciesApi.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `22-14`/`adr/0100`: the sentence that turns "the calendar is simply absent" into something a person
 * can act on.
 *
 * <b>The state it exists for.</b> A person is granted the calendar on one shop and not another. The
 * shop picker is already there (`13-07`/`adr/0068`) and the shop they are looking at genuinely has no
 * calendar, so `/calendar` correctly refuses - and says only "you do not have permission", which is
 * word-for-word what somebody who has never been granted a calendar anywhere sees. `22-14`'s own item
 * file calls that indistinguishability the whole defect. This asks the calendar's own backend where
 * this identity's calendars actually are and names the ones that are not here.
 *
 * <b>Renders nothing at all in the ordinary cases</b>, which is most of the time: no other tenancy,
 * the backend unconfigured, the call still in flight, or the call failed. A hint that cannot be
 * produced is not an error worth showing - the refusal above it is already the answer, and this only
 * ever adds to it. Failure is swallowed to `null` rather than surfaced for the same reason
 * `PermissionsProvider` swallows its own: a helper that turns into a second error message makes the
 * screen worse than it was without it.
 *
 * <b>Not a component per screen.</b> Only `/calendar` mounts it - the section's landing page, and the
 * one a bookmark or a stale link lands on. Repeating it on all six calendar screens would say the
 * same thing six times to somebody who has already read it once.
 */
export function CalendarElsewhereNotice() {
  const { user } = useAuth();
  const { activeSiteId } = usePermissions();
  const strings = useStrings();
  const [elsewhere, setElsewhere] = useState<CalendarTenancy[]>([]);

  const accessToken = user?.access_token;
  useEffect(() => {
    if (!accessToken || config.calendarApiBaseUrl === null) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    fetchMyCalendarTenancies(accessToken, controller.signal)
      .then((tenancies) => {
        if (!cancelled) {
          // The shop being looked at is excluded by id, not by name: two shops can share a name, and
          // the point of the sentence is "somewhere other than here".
          setElsewhere(tenancies.filter((tenancy) => tenancy.tenantId !== activeSiteId));
        }
      })
      .catch(() => {
        // Deliberately silent - see this component's own remarks.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accessToken, activeSiteId]);

  if (elsewhere.length === 0) {
    return null;
  }

  return (
    <Alert tone="info">
      {strings.calendarElsewhereNotice}
      <ul>
        {elsewhere.map((tenancy) => (
          <li key={tenancy.tenantId}>
            {tenancy.tenantName.trim().length > 0
              ? tenancy.tenantName
              : `${strings.unnamedSite} (${tenancy.tenantId.slice(0, 8)})`}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
