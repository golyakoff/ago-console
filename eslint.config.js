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
  // `23-100`: the file-scoped `set-state-in-effect` override that stood here is gone.
  //
  // `23-96` downgraded the rule for twenty-one named files. That was per-file, which ESLint has no way
  // to narrow: a *new* synchronous `setState` written in any of them tomorrow was only a warning too, so
  // twenty-one files sat outside a gate the rest of the console was inside.
  //
  // The eight reset-on-id-change findings were converted outright. The remaining fifteen are
  // fetch-on-mount, and each now carries an `eslint-disable-next-line` on its own line with its own
  // reason: the analyzer is right about the shape and wrong about the defect, since fetching in an
  // effect is what React documents and every `setState` it reaches runs after an `await`. Marking the
  // fifteen deliberate sites individually leaves every other line in those files an error again, which
  // is strictly more protection than the list it replaces - not less.
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
