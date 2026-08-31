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
  /**
   * `8-06`: this build is the *public* demo console, whose operator credentials are printed on the
   * demo pages for anyone to use. Turns on the shell's standing "you are reading strangers' messages"
   * strip.
   *
   * A deployment-time flag rather than a constant, because the same bundle is the real product's
   * console: hard-coding the sentence would make it a lie the first time a paying tenant signs in,
   * and hard-coding its absence would leave the public deployment silent. `required()` is not used,
   * and the default is off, so a deployment that says nothing about it gets no notice rather than an
   * accidental one.
   */
  isPublicDemo: boolean;
  /**
   * `19-03`: `Ago.Faq.Api`'s own origin - a *different* backend than `apiBaseUrl` above, on its own
   * repository's own deploy (`ago-faq`, not `ago-chat`), because the AI FAQ module's knowledge-base
   * text is that module's own data, never proxied or understood by `Ago.Chat.*`
   * (`docs/backlog/19-03-ai-faq-module.md`). The knowledge-base editor sends it the same operator
   * bearer token every other call already carries - that backend validates the identical
   * Keycloak-issued token, a deliberate, recorded decision, not a second login.
   *
   * `string | null`, not `required()` like `apiBaseUrl`/`keycloakAuthority`/`keycloakClientId` above:
   * those three are load-bearing for every screen in this console (auth, every API call), so a
   * missing one should fail the whole app's boot loudly. This one is load-bearing for exactly one
   * screen - the FAQ knowledge-base editor - and coupling the entire console's boot to a second
   * repository's own deploy existing yet would be the wrong blast radius. `null` when unset is a
   * real, supported state: that one screen renders "not configured" instead, everything else is
   * unaffected. Concretely, this matters today - `ago-faq` has no production deployment yet
   * (`.env.production` deliberately leaves this unset), and the console must still boot and serve
   * every other screen on that deployment in the meantime.
   */
  faqApiBaseUrl: string | null;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name} - see .env.example.`);
  }

  return value;
}

/** `19-03`: `required`'s counterpart for a variable this app must not fail its whole boot over -
 * `faqApiBaseUrl`'s own doc comment (`Config`) has the reasoning. `null` when unset, the same
 * trailing-slash trim `required` applies for a value that is set, so `faqKnowledgeBaseApi.ts` never
 * has to trim it itself. A local binding, not a repeated `import.meta.env.VITE_FAQ_API_BASE_URL`
 * property read, so the truthiness check and the value used inside it are unambiguously the same one
 * read of `import.meta.env` rather than two. */
function optional(value: string | undefined): string | null {
  return value ? value.replace(/\/+$/, "") : null;
}

// Dot access, not a dynamic env[name] lookup: Vite's own ImportMetaEnv carries a permissive index
// signature alongside vite-env.d.ts's specific VITE_* properties, so indexing by a variable name
// resolves to `any` regardless of the augmentation - dot access is what actually gets the specific,
// non-any type each property declares.
export const config: Config = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, ""),
  keycloakAuthority: required("VITE_KEYCLOAK_AUTHORITY", import.meta.env.VITE_KEYCLOAK_AUTHORITY).replace(/\/+$/, ""),
  keycloakClientId: required("VITE_KEYCLOAK_CLIENT_ID", import.meta.env.VITE_KEYCLOAK_CLIENT_ID),
  // Exact `"true"`, so that `VITE_PUBLIC_DEMO=false` - what someone turning this off will actually
  // write - is off rather than a non-empty truthy string.
  isPublicDemo: import.meta.env.VITE_PUBLIC_DEMO === "true",
  // `19-03`: unset -> `null`, never `""` - an empty string would be a truthy-looking value that still
  // fails every `fetch` it built a URL from, silently, instead of the explicit "not configured" state
  // `faqKnowledgeBaseApi.ts` checks for up front.
  faqApiBaseUrl: optional(import.meta.env.VITE_FAQ_API_BASE_URL),
};
