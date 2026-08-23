/**
 * Environment-based, per Vite's own `import.meta.env` mechanism (`VITE_`-prefixed variables from
 * `.env.local`, gitignored - `.env.example` documents the shape). Never baked into the widget's own
 * per-embed `data-*` attribute style (`ago-widget`'s own approach) - this is a normal SPA deployed
 * once per environment, not a script embedded on a page it does not control, so one build per
 * environment is the right shape here, matching how most internal tools are actually deployed.
 *
 * `keycloakAuthority` must be the *exact* issuer string `Ago.Chat.Api`'s own `Auth:Keycloak:Authority`
 * uses - issuer validation is an exact match (`local-dev.md`'s own documented `127.0.0.1` vs.
 * `localhost` gotcha, `5-05`), not something this config can paper over.
 */
export interface Config {
  apiBaseUrl: string;
  keycloakAuthority: string;
  keycloakClientId: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name} - see .env.example.`);
  }

  return value;
}

// Dot access, not a dynamic env[name] lookup: Vite's own ImportMetaEnv carries a permissive index
// signature alongside vite-env.d.ts's specific VITE_* properties, so indexing by a variable name
// resolves to `any` regardless of the augmentation - dot access is what actually gets the specific,
// non-any type each property declares.
export const config: Config = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, ""),
  keycloakAuthority: required("VITE_KEYCLOAK_AUTHORITY", import.meta.env.VITE_KEYCLOAK_AUTHORITY).replace(/\/+$/, ""),
  keycloakClientId: required("VITE_KEYCLOAK_CLIENT_ID", import.meta.env.VITE_KEYCLOAK_CLIENT_ID),
};
