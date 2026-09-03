import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

/**
 * `ago-root#351`: the one place this gate's port lives in Node-side test code. `.env.ux-gate` (repo
 * root) is the single file a person edits to change it - `playwright.config.ts`'s `webServer`/
 * `baseURL` and `fixtures/auth.ts`'s `UX_GATE_AUTHORITY` both import `PORT`/`BASE_URL`/
 * `UX_GATE_AUTHORITY` from here instead of each repeating the literal, so the three no longer have a
 * way to disagree with each other - the exact failure mode a previous worker on `11-19` hit by hand-
 * repointing two of the three and not the third.
 *
 * Read with Vite's own `loadEnv` - the same function `vite build --mode ux-gate` uses internally to
 * resolve `.env.ux-gate` (`.env.[mode]`, in `envDir`) - not a hand-rolled parser, so this file and the
 * built app's own `import.meta.env.VITE_API_BASE_URL` (`src/config.ts`) are guaranteed to read the
 * identical file through the identical resolution rule, rather than two implementations that could
 * quietly drift apart.
 *
 * **Fixed ports, one value per repository, not an ephemeral one.** `playwright.config.ts`'s
 * `webServer.command` has to build the bundle (`npm run build:ux-gate`) *before* `vite preview` binds
 * any port, and that build already burns `VITE_API_BASE_URL`/`VITE_KEYCLOAK_AUTHORITY` into the
 * bundle at that point - a `port: 0` chosen only once `preview` starts could not be told to code
 * already compiled into `dist/`, so an ephemeral port was ruled out here, not merely left undecided.
 * `ago-console` keeps `4173` (`.env.ux-gate`'s own long-standing value); `ago-calendar-console` moved
 * to `4174` in its own `.env.ux-gate` - two fixed, different ports is what lets both gates' preview
 * servers bind at once.
 */
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const env = loadEnv("ux-gate", REPO_ROOT, "VITE_");

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name} in .env.ux-gate.`);
  }

  return value;
}

export const BASE_URL = required("VITE_API_BASE_URL", env.VITE_API_BASE_URL).replace(/\/+$/, "");

// Parsed out of `BASE_URL` rather than a second literal in `.env.ux-gate` - `VITE_API_BASE_URL` is
// already the one place the port is written, and `playwright.config.ts` needs the bare number for
// `vite preview -- --port`, which does not accept a full origin.
export const PORT = Number(new URL(BASE_URL).port);

export const UX_GATE_AUTHORITY = required(
  "VITE_KEYCLOAK_AUTHORITY",
  env.VITE_KEYCLOAK_AUTHORITY,
).replace(/\/+$/, "");

export const UX_GATE_CLIENT_ID = required("VITE_KEYCLOAK_CLIENT_ID", env.VITE_KEYCLOAK_CLIENT_ID);
