/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_KEYCLOAK_AUTHORITY: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  /** Optional (`8-06`) - unset everywhere except the public demo deployment. */
  readonly VITE_PUBLIC_DEMO?: string;
  /** Optional (`19-03`) - `Ago.Faq.Api`'s own origin, a different backend than `VITE_API_BASE_URL`
   * above (`config.ts`'s own remarks have the full reasoning). Unset until `ago-faq` has a real
   * deployment to point at. */
  readonly VITE_FAQ_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
