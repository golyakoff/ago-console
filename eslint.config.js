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
  { ...reactHooks.configs["recommended-latest"], files: ["src/**/*.{ts,tsx}"] },
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
