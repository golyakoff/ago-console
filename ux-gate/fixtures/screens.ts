import { CALENDAR_WORKER_ID, OPEN_CONVERSATION_ID } from "./data.js";

/**
 * `15-11`'s own Open Questions leaves "which screens" undecided ("Probably: the author's six named
 * surfaces first, extended when a screen earns it" - no such list exists anywhere in the docs). Five
 * screens, chosen and justified here rather than covering all seventeen routes in `App.tsx`:
 *
 * - **The workspace with a conversation open** (`/conversations/:id`). Closest to both historical
 *   defects this item exists for: the composer (the "one character wide input" shape) and the
 *   message thread (the "dark grey on dark blue" shape) both live here, and nowhere else in the app.
 * - **`/admin`**, the site-wide conversations table. The densest data table in the product outside
 *   the reports, and a screen every operator with `site:configure` opens routinely.
 * - **`/owner`**, the cross-tenant platform-operations view. Named explicitly in `15-11`'s backlog
 *   text as a real, immediate win ("puts eyes on ... currently invisible" screens) - it is the one
 *   screen in this list that genuinely cannot be looked at any other way before `20-20`.
 * - **`/settings/widget`**, one settings form - chosen over the other five settings screens because
 *   it is the one with the most varied control types on one page (colour swatch picker, select,
 *   textarea, text input), which is where `adr/0030`'s eleven components actually earn their keep as
 *   a set rather than one at a time.
 * - **`/analytics`**, one report - two real data tables plus a date-range form, and (per its own doc
 *   comment) the screen that "loads the server's own default window ... on first render", so it is
 *   reachable with no interaction, unlike `/analytics/conversion`'s sibling screens.
 *
 * Every route not named here is either a thin variant of one already covered (the other four settings
 * screens; `/analytics/conversion`, `/analytics/tags`, `/analytics/booking-flow` next to `/analytics`
 * itself) or reached through a flow this gate does not drive (`/callback`, `/signup`, `/onboarding` -
 * all pre-authentication or account-creation states a signed-in seeded operator never passes through).
 * A screen that later "earns it" (the item's own words) is a new entry in this array, nothing more.
 */
export interface UxGateScreen {
  name: string;
  path: string;
  /** Only the conversation screen needs the SignalR hub mock - every other screen's data is plain
   * REST, already covered by `apiStubs.ts`. */
  needsHubMock?: boolean;
  /** Waited for before measuring or screenshotting, so neither ever races the initial fetch. */
  readySelector: string;
}

export const UX_GATE_SCREENS: readonly UxGateScreen[] = [
  {
    name: "queue-conversation",
    path: `/conversations/${OPEN_CONVERSATION_ID}`,
    needsHubMock: true,
    // Waits for a seeded message bubble, not `.ago-composer__input` - the composer renders
    // synchronously on mount, before `JoinConversationAsync`'s async round trip over the mocked hub
    // resolves (`ConversationPage.tsx`'s own effect), so waiting on the composer alone let this gate
    // measure/screenshot a real run where the thread had not populated yet. A bubble existing implies
    // the composer already does too - it is the later of the two events, never the earlier.
    readySelector: ".ago-message__bubble",
  },
  {
    name: "admin-conversations",
    path: "/admin",
    readySelector: ".ago-table-scroll",
  },
  {
    name: "owner-sites",
    path: "/owner",
    readySelector: ".ago-table-scroll",
  },
  {
    name: "settings-widget",
    path: "/settings/widget",
    readySelector: "form.ago-stack",
  },
  {
    name: "analytics",
    path: "/analytics",
    readySelector: ".ago-table-scroll",
  },
  // `22-06`/`adr/0093`: four of AGO Calendar's five console screens, moved from
  // `ago-calendar-console`'s own gate (which covered all eight of its own routes - six screens plus
  // the two worker-slots/re-cut drill-downs, `15-11`'s addendum in that repository) into this one's
  // own five-screens-not-seventeen curation (this file's own header, above).
  //
  // **Five, not six.** The backlog item this moved under named a sixth screen, Access - `22-05`
  // (`adr/0093`, merged into `ago-calendar` while this item was in flight) deleted that product's
  // entire `operators`/`roles` identity model, the console endpoints that managed it, and with them
  // any reason for that screen to exist. It was never wired into `ago-console` at all, so there is
  // nothing here for it to be excluded *from* - this is not the same shape as `/calendar/setup`
  // below.
  //
  // **Four of those five are covered; one, `/calendar/setup`, is not**, for a real and unrelated
  // reason: it renders an inline embed `<script>` snippet as literal `<pre>` text, which would fail
  // this gate's own fourth assertion (`ux-gate/lib/i18nCompleteness.ts`) over syntax that was never
  // translatable interface chrome to begin with. `InstallSnippetPage` (`Ago.Chat.Api`'s own
  // analogous embed-snippet screen) was excluded from this same gate for the identical reason (this
  // file's own header names it explicitly) - `/calendar/setup` follows that precedent rather than
  // becoming this gate's first exception to it. Adding it later means either accepting that gap or
  // teaching the assertion a new exemption; it does not mean it was overlooked.
  //
  // ago-calendar-console's own gate covered all eight of its own routes (`ux-gate/fixtures/screens.ts`
  // in that repository, before this item), because it had few enough screens that all of them mattered
  // and three had no other way to be looked at at all. This move dropped two of those eight routes -
  // the worker-slots and worker-recut drill-downs - which `15-16` (`ago-root#397`) restored below,
  // rather than recording their absence as a considered reduction: they were a real regression, not a
  // re-curation, and the five-screens-not-seventeen judgement above never counted them as part of its
  // own denominator in the first place (they are routes off `calendar-workers`, not screens of their
  // own - see the `15-16` note below for the full reasoning). `/calendar/setup`'s exclusion remains
  // the only screen this gate deliberately does not cover, and remains a stated reason, not a rounding.
  {
    name: "calendar-queue",
    path: "/calendar",
    readySelector: ".ago-table-scroll",
  },
  {
    name: "calendar-workers",
    path: "/calendar/workers",
    readySelector: ".ago-table-scroll",
  },
  {
    name: "calendar-availability",
    path: "/calendar/availability",
    readySelector: "form.ago-stack",
  },
  {
    name: "calendar-contacts",
    path: "/calendar/contacts",
    readySelector: ".ago-table-scroll",
  },
  // `15-16` (`ago-root#397`): the two drill-downs off `calendar-workers` - `ago-calendar-console`'s
  // own gate covered both (`worker-slots`, `worker-recut` in that repository's `screens.ts`, before
  // `22-06`), and the move dropped them. That is a regression, not a re-curation: this file's own
  // "5 screens, 1 excluded" accounting above is untouched by these two - they are routes reached only
  // from `CalendarWorkersPage`'s own row actions, never from the nav, the identical shape
  // `/conversations/:id` above already has inside the workspace layout (`App.tsx`'s own "Five
  // screens, not six" comment already calls this out explicitly). Adding them here is restoring
  // coverage of two existing routes, not growing the five-screen denominator to six or seven -
  // whichever count is being read off this file, it must still say "one exclusion, `/calendar/setup`,
  // for the stated `<pre>`-snippet reason", never anything that reads as if these two were ever the
  // exclusion.
  {
    name: "calendar-worker-slots",
    path: `/calendar/workers/${CALENDAR_WORKER_ID}/slots`,
    // Waits for the materialised-schedule table, not the date-range form above it (which renders on
    // mount, before `getWorkerSlots` resolves) - the same "wait for the later of the two events"
    // reasoning `queue-conversation`'s own `readySelector` comment gives.
    readySelector: ".ago-table-scroll",
  },
  {
    name: "calendar-worker-recut",
    path: `/calendar/workers/${CALENDAR_WORKER_ID}/recut`,
    // Unlike every other screen in this file, nothing here is fetched on mount - `loadPreview` only
    // runs once the operator submits the date field, exactly like the source screen this was moved
    // from. The from-date form is therefore the screen's own first real render, not a loading
    // skeleton standing in for one; there is nothing later to wait for without simulating a submit,
    // which `openScreen.ts` does not do for any screen (this file's own header: navigate-and-wait,
    // never navigate-and-interact).
    readySelector: "form.ago-row",
  },
];
