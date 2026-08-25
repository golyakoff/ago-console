# AGO Chat operator console

The SPA operators work in: their queue, their active conversations, presence and history. Expected
to grow two more surfaces over time - tenant self-service configuration and an internal operations
view - which is why the framework choice weighed more than the operator console alone
(`../ago-root/docs/adr/0023-console-framework-react.md`).

**React** (Vite + TypeScript), decided in `adr/0023`. Login is Authorization Code + PKCE against
Keycloak (`adr/0022`) via `oidc-client-ts` - a public client, no client secret (the OIDC client id is
public by design, the same status as the widget's own site key).

Protocol rules: `../ago-root/docs/conventions/api-design.md`.
Realtime behaviour it must implement: `../ago-root/docs/architecture/realtime.md`.

## Running locally

```bash
cd ago-console
npm ci
cp .env.example .env.local   # adjust if your local cluster differs
npm run dev
```

Opens on `http://localhost:5173` by default (Vite's own default port) - already a registered
`redirectUri`/`webOrigin` for the `ago-console` Keycloak client
(`../ago-deploy/k8s/base/keycloak-realm-import.json`), alongside `ago-widget`'s own `:8080`.

With the local cluster up (`../ago-root/docs/runbooks/local-dev.md`) and `Ago.Chat.Api` running,
signing in redirects to Keycloak, back to `/callback`, and the queue page opens a real
`/hubs/operator` connection with the resulting token - proof the whole chain works end to end, not
yet the real queue/conversation UI (`5-07`).

## What's here

```
src/
  config.ts        environment-based config (API base URL, Keycloak authority/client id, and
                    8-06's optional public-demo flag) - VITE_-prefixed, .env.local (gitignored),
                    .env.example documents the shape
  auth/            oidc-client-ts UserManager, a React context, the RequireAuth route guard
  realtime/        the operator-hub SignalR connection (5-09's own withCredentials:false gotcha
                    applies here too - see the file's own comment)
  pages/           CallbackPage (the OIDC redirect handler), QueuePage/ConversationPage
                    (placeholders - 5-07 builds the real thing)
```

## Building for the public deployment

`8-02`: `npm run build` (Vite's own `tsc -b && vite build`) picks up `.env.production` automatically
in production mode - committed, not gitignored, since none of its values are secrets (see the
file's own header comment). One of them is `8-06`'s `VITE_PUBLIC_DEMO=true`, which is what puts the
"this console is the public demo, these are strangers' conversations" strip under the shell header on
this deployment and on no other. `Dockerfile` builds this into a minimal nginx image
(`../ago-root/docs/adr/0026-*`'s "no registry, build on the VPS" mechanism) -
`../ago-deploy/k8s/build-static-images.sh` builds it,
`../ago-deploy/k8s/overlays/demo/console-static.yaml` runs it behind
`https://console.reserve-me.ru`. `nginx.conf` adds the client-side-routing fallback
react-router's `/callback` route needs (a direct load of any path but `/` would otherwise 404
before react-router ever got a chance to handle it).

## Testing

```bash
npm run typecheck
npm run lint
```

No unit tests yet - there is no logic here worth unit-testing beyond what TypeScript's own compiler
and ESLint already catch (the scaffold has no business logic, only wiring). `5-07`'s own protocol
handling (sequence ordering, dedup, backoff - the same shape `ago-widget`'s own tests already cover
independently, since neither runtime shares code with the other) is where this repository's first
real unit tests belong.
