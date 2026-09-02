import { defineConfig } from "@playwright/test";

/**
 * `15-11`: the rendered UX gate's own Playwright project - see `ux-gate`'s sibling files for the
 * three assertions and why this had to be a real browser (jsdom has no layout engine, `15-11`'s own
 * "What was checked before scoping" section).
 *
 * `PORT`/`BASE_URL` are fixed rather than left to Vite's own auto-pick, for two reasons that both
 * matter: a CI-reproducible target (the same port every run, not whatever happened to be free), and
 * same-origin fetch/WebSocket traffic - the gate's own build (`npm run build:ux-gate`, `vite build
 * --mode ux-gate`) points `VITE_API_BASE_URL`/`VITE_KEYCLOAK_AUTHORITY` at this exact origin
 * (`.env.ux-gate` at the repo root) specifically so every intercepted request
 * (`fixtures/apiStubs.ts`/`fixtures/hubMock.ts`) is same-origin and needs no CORS headers of its own -
 * pointing the build at the real `.env.production` origin instead would make every stubbed `fetch` a
 * cross-origin request Playwright's `route.fulfill` would still have to answer with the right
 * `Access-Control-Allow-Origin` header for the browser to accept, for no benefit this gate needs.
 */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.spec.ts"],
  // An unset `outputDir` landed traces/`.last-run.json` at `<repo-root>/test-results/` when this was
  // first wired up (run via `npm run ux-gate` from the repository root) - outside `ux-gate/` entirely
  // and outside `.gitignore`'s matching rule for it. Pinned explicitly, relative to *this config
  // file's own directory* (the same base `testDir: "."` above already resolves against) - a first
  // attempt at this fix wrote `"./ux-gate/test-results"` and got `ux-gate/ux-gate/test-results/`
  // instead, which is what confirmed the resolution base empirically rather than by assumption.
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"]] : [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    // `15-11`'s own scope: "Fixed viewport, animations/transitions disabled ... so the same run
    // always produces the same pixels." `reducedMotion: "reduce"` emulates `prefers-reduced-motion`,
    // which every animation in this codebase already respects (`components.css`'s own
    // `@media (prefers-reduced-motion: reduce)` block on `.ago-spinner`) - the platform-level switch
    // rather than a per-component override this config would otherwise have to keep in sync with.
    // Nested under `contextOptions`, not a top-level `use` field - this Playwright version's own
    // `PlaywrightTestOptions` does not re-expose every `BrowserContextOptions` key at the top level.
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: {
    // Deliberately not `npm run preview` alone: that serves whatever `dist/` already contains, which
    // could be a stale build from an unrelated `npm run build` (the ordinary production one, pointed
    // at the real deployment origin) left over in a developer's working tree. Building here, with the
    // gate's own mode, is what makes this command self-contained and CI-reproducible on its own.
    command: `npm run build:ux-gate && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-375x812",
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop-1280x800",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
