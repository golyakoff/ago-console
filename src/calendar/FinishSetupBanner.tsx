import { useState } from "react";
import { Link } from "react-router-dom";
import type { CalendarReadiness } from "../api/calendarApi.js";
import { dismissFinishSetupBanner, isFinishSetupBannerDismissed } from "./finishSetupBannerDismissal.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `26-330`/`26-318`: the always-there nudge back into the wizard, rendered on `/calendar/setup`,
 * `/calendar/masters` and `/calendar/services` - the three classic screens a tenant can still reach
 * (and edit from) while setup is unfinished. Deliberately not rendered on the wizard itself
 * (`/calendar/setup/guide`): a "finish setup" link pointing at the page already open would be noise,
 * not a nudge.
 *
 * <b>No second source of truth.</b> `isBookable` is read straight off the same `GET /booking-readiness`
 * answer `BookingReadiness.tsx` and `deriveWizardStep` already read - `readiness[0]`, matching every
 * other wizard-adjacent read in this codebase, which only ever looks at the tenant's first calendar
 * (`setupWizardStep.ts`'s own doc comment: "the wizard only ever walks one calendar"). `readiness ===
 * null` covers both "not loaded yet" and "the supplementary read failed"
 * (`CalendarWorkersPage.reload`'s own remarks) - this component renders nothing rather than guess in
 * either direction.
 *
 * <b>Dismissible for the rest of this browser tab, not forever.</b>
 * `finishSetupBannerDismissal.ts` holds the one bit this needs in `sessionStorage`, keyed per site so
 * switching the active tenancy never carries one tenant's dismissal onto another's still-unfinished
 * setup. A fresh tab, or the calendar actually becoming bookable, both bring the banner back - there is
 * no "never show this again": an unfinished calendar is a standing fact worth repeating each session,
 * not a one-time tip.
 */
export function FinishSetupBanner({ readiness, siteId }: { readiness: CalendarReadiness[] | null; siteId: string }) {
  const strings = useStrings();

  // `23-96`/`23-100`: adjusted during render, not in an effect - `react-hooks/set-state-in-effect` (v7)
  // flags a synchronous `setState` in an effect body; comparing against the site id this state was last
  // read for (react.dev/learn/you-might-not-need-an-effect, "Adjusting some state when a prop changes")
  // re-derives on the same render `siteId` changes, so a tenant switch never shows a stale dismissal
  // read for the previous site.
  const [dismissedForSite, setDismissedForSite] = useState(siteId);
  const [dismissed, setDismissed] = useState(() => isFinishSetupBannerDismissed(siteId));
  if (dismissedForSite !== siteId) {
    setDismissedForSite(siteId);
    setDismissed(isFinishSetupBannerDismissed(siteId));
  }

  if (readiness === null || readiness.length === 0 || readiness[0].isBookable || dismissed) {
    return null;
  }

  return (
    <Alert
      tone="info"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissFinishSetupBanner(siteId);
            setDismissed(true);
          }}
        >
          {strings.calendarFinishSetupBannerDismissButton}
        </Button>
      }
    >
      <Link to="/calendar/setup/guide">{strings.calendarFinishSetupBannerTitle}</Link>
    </Alert>
  );
}
