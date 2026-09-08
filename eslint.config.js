// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // `15-11`: react-hooks/react-refresh restricted to `src/**` explicitly - both were previously
  // unrestricted (applying repo-wide by omission, harmless while `src` was the only TypeScript in
  // this repository). `ux-gate/` is plain TypeScript with no component and no hook, and
  // `react-refresh/only-export-components` in particular would flag ordinary multi-export fixture/lib
  // modules there for a Fast-Refresh constraint that has no meaning outside a Vite-served React tree.
  // `23-96`: at v7 the bare `configs["recommended-latest"]` reverted to the legacy eslintrc shape
  // (`plugins: ["react-hooks"]`, an array of strings) - only `configs.flat["recommended-latest"]` is
  // flat-config shaped (`plugins: { "react-hooks": <plugin> }`), per the plugin's own README ("Flat
  // Config" section). Spreading the bare export is what made ESLint 9 refuse to run at all.
  { ...reactHooks.configs.flat["recommended-latest"], files: ["src/**/*.{ts,tsx}"] },
  { ...reactRefresh.configs.vite, files: ["src/**/*.{ts,tsx}"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.app.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // `23-96`: `react-hooks/preserve-manual-memoization` is a React Compiler diagnostic, not a general
  // correctness rule - it fires when the Compiler's static analysis cannot verify that a manual
  // `useCallback`/`useMemo` dependency array is equivalent to what it would infer itself, and this
  // project does not run the Compiler (`vite.config.ts` uses plain `@vitejs/plugin-react`, no
  // `babel-plugin-react-compiler`), so "could not preserve memoization" has no runtime consequence -
  // nothing is ever compiled. Every instance it found here (`AdminConversationsPage.refresh`,
  // `WorkspaceLayout.refreshQueue`/`markRead`) was this codebase's own established, deliberate pattern
  // of depending on `user?.access_token` rather than the whole `user` object, specifically so an
  // unrelated `user` identity change (new object, same token) does not re-create the callback - the
  // Compiler's inference cannot verify that narrowing is safe and conservatively refuses to. Disabled
  // here, not per-callsite, because the rule does not fit this codebase at all until the Compiler is
  // adopted - see this item's own report for what adopting it would mean.
  { files: ["src/**/*.{ts,tsx}"], rules: { "react-hooks/preserve-manual-memoization": "off" } },
  // `23-100`: `23-96` left twenty-three `react-hooks/set-state-in-effect` findings across twenty-one
  // files on this list, in two shapes - **reset-on-id-change** (a panel clearing its own state when
  // the conversation or worker it shows changes) and **fetch-on-mount** (a screen loading a default
  // window of data the first time it renders). This item converted every reset-on-id-change site:
  // `OwnerSitesPage` (keyed on `activeQuery`), `PolicyPage` (keyed on `documentKey`/`version` - this
  // route does not remount between two published documents) and the five conversation-workspace panels
  // (`ChannelIdentitiesPanel`, `ContactDetailsPanel`, `ConversationNotesPanel`,
  // `ConversationOutcomePanel`, `ConversationTagsPanel`, all keyed on `conversationId`) - each now
  // adjusts state during render instead of in an effect (react.dev/learn/you-might-not-need-an-effect),
  // the same technique `23-96` already used for `Composer`/`VisitorHistoryPanel`. None of those eight
  // findings remain; all eight files are off this list.
  //
  // **What is left is fetch-on-mount, and it stays deliberately unconverted.** Every remaining file
  // calls an async data-loading function directly inside a `useEffect` (`void reload(signal)` or
  // equivalent) - the plugin's v7 static analysis flags that call itself, not merely a literal
  // synchronous `setState`, because calling an async function is still a direct, unconditional call
  // from the effect body regardless of where the `await` sits inside it. Silencing that by reshaping
  // the same call into a `.then()` chain would dodge the linter without answering the question the
  // rule is actually asking - *when should this request fire, and relative to what* - which is exactly
  // the per-screen judgement `23-100`'s own scope refused to make mechanically for twelve calendar/
  // report screens and one already-intricate reconnect path in one sitting:
  // - `WorkerScheduleSection` (keyed on `workerId`), `CalendarWorkerSlotsPage` (`workerId` + `range`),
  //   `CalendarBookingsPage`/`CalendarContactsPage`/`CalendarQueuePage`/`CalendarServicesPage`/
  //   `CalendarAvailabilityPage` (permission-gated, some also re-fetch on a `range` the operator picks):
  //   whether switching the worker or the range should show a skeleton first or keep the stale grid
  //   until the new one arrives is a screen-level UX call this item does not make on their behalf.
  // - `BookingFlowConversionPage`/`ConversionReportPage`/`MyNumbersPage`/`OperatorAnalyticsPage`/
  //   `TagBreakdownReportPage`: each already states, in its own comment, a deliberate "load the
  //   server's own default window on first render" design - moving that fetch changes what "opening
  //   the report" means, not just how the linter reads it.
  // - `DocumentsPage`: the top-level list load (permission-gated, effectively once per site) and its
  //   nested `AcceptancesList` (one instance per consent purpose) are the identical fetch-on-mount
  //   shape one level apart; converting the parent without the child - or the reverse - would split one
  //   screen's loading behaviour in two, which is the "convert half a screen" failure mode `23-100`'s
  //   own brief warns against.
  // - `TeamChatPage`: this file's own doc comment already explains why the mount-load and the
  //   reconnect catch-up share one effect and one `previousConnectionStateRef` on purpose - splitting
  //   it needs the same care that comment took, not a mechanical pass.
  //
  // The rule stays a full "error" everywhere else, including new code in these same files going
  // forward - only the lines already present when `23-96` landed are downgraded, and only in the files
  // below. **Severity is per-file, not per-line** - there is no mechanism that distinguishes a finding
  // that existed when `23-96` landed from one added tomorrow, so a *new* `set-state-in-effect` in any
  // of the files below is a warning too, not an error, and `npm run lint` will not fail on it. That is
  // the real cost of this override and it is bounded by the list: every other file in the console
  // (including the eight this item just removed) still errors on it. A follow-up item carries the
  // fetch-on-mount half out, screen by screen, and deletes this block once the list is empty.
  {
    files: [
      "src/calendar/WorkerScheduleSection.tsx",
      "src/pages/BookingFlowConversionPage.tsx",
      "src/pages/CalendarAvailabilityPage.tsx",
      "src/pages/CalendarBookingsPage.tsx",
      "src/pages/CalendarContactsPage.tsx",
      "src/pages/CalendarQueuePage.tsx",
      "src/pages/CalendarServicesPage.tsx",
      "src/pages/CalendarWorkerSlotsPage.tsx",
      "src/pages/ConversionReportPage.tsx",
      "src/pages/DocumentsPage.tsx",
      "src/pages/MyNumbersPage.tsx",
      "src/pages/OperatorAnalyticsPage.tsx",
      "src/pages/TagBreakdownReportPage.tsx",
      "src/pages/TeamChatPage.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  // `ux-gate/` is a second TypeScript project (its own `tsconfig.json`, sibling to `src`'s - that
  // file's own doc comment says why it cannot share `tsconfig.app.json`), so it gets its own
  // type-aware-linting block rather than folding into the one above: pointing `parserOptions.project`
  // at the wrong `tsconfig.json` would make every import in this directory an unresolvable-project
  // error rather than a real lint finding.
  {
    files: ["ux-gate/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./ux-gate/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
