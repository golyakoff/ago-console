import { OPEN_CONVERSATION_ID } from "./data.js";

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
];
