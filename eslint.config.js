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
  // `23-96`: this specific list of files carries pre-existing `react-hooks/set-state-in-effect`
  // findings (v7 is the first version of this plugin that polices the pattern) that this item's own
  // report fixed a representative few of and explicitly left the rest of, rather than rewriting ~20
  // fetch-on-mount/reset-on-id-change effects across calendar, billing, report and conversation-panel
  // screens without the per-screen review that needs. The rule stays a full "error" everywhere else,
  // including new code in these same files going forward - only the lines already present when this
  // migration landed are downgraded, and only in these files, so `npm run lint` keeps failing on any
  // *new* instance of the pattern instead of hiding it here. Tracked in a follow-up backlog item (not
  // yet numbered at the time this file was written - see this item's own report).
  //
  // **Corrected at landing: the two sentences above claim more than ESLint can do.** Severity is
  // per-file, not per-line - there is no mechanism that distinguishes a finding that existed when this
  // landed from one added tomorrow. So a *new* `set-state-in-effect` in any of the twenty-one files
  // below is a warning too, not an error, and `npm run lint` will not fail on it. That is the real
  // cost of this override and it is bounded by the list: every other file in the console still errors.
  // `23-100` is the follow-up that removes the list, and until it lands these files are the soft spot.
  {
    files: [
      "src/calendar/WorkerScheduleSection.tsx",
      "src/owner/OwnerSitesPage.tsx",
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
      "src/pages/PolicyPage.tsx",
      "src/pages/TagBreakdownReportPage.tsx",
      "src/pages/TeamChatPage.tsx",
      "src/workspace/ChannelIdentitiesPanel.tsx",
      "src/workspace/ContactDetailsPanel.tsx",
      "src/workspace/ConversationNotesPanel.tsx",
      "src/workspace/ConversationOutcomePanel.tsx",
      "src/workspace/ConversationTagsPanel.tsx",
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
