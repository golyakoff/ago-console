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
  pages/           CallbackPage (the OIDC redirect handler), ConversationPage, and the two
                    site-scoped screens gated on `site:configure` (AdminConversationsPage,
                    WidgetConfigPage)
  workspace/       11-06's operator workspace: the conversation rail, the thread, the composer
  shell/           11-05's persistent frame - header, permission-gated navigation, identity
  components/      adr/0030's closed component set; design/ holds its tokens
  testing/         mounting helpers for the behaviour tests - never imported by application code
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
npm test
```

All three run in CI on every push and pull request (`.github/workflows/ci.yml`). `npm test` was added
to that workflow on 2026-08-25 - before then every test here was unenforced, which was an omission
rather than a decision.

The levels, and what belongs at each, are `../ago-root/docs/conventions/testing.md`'s frontend
section. What this repository actually has:

**Tested**

- **Pure logic**, beside the module: `realtime/protocol/` (sequence ordering, dedup, jittered
  backoff), `realtime/linkStatus`, `workspace/attention` and `workspace/threadModel`, `time/format`,
  `pages/widgetConfigValidation`, `owner/ownerSites`.
- **Permission gating** (`auth/permissionGating.test.tsx`): an operator without a permission is not
  offered the control, on the shell navigation, on the two site-scoped pages and on the
  attachment-delete action - including the two fail-closed cases that are easy to get backwards,
  "the answer has not arrived yet" and "the call failed". Hiding a control is never the real gate
  (`17-01`'s server-side check is), and showing an admin action to a non-admin is still a defect only
  a test at this level can catch.
- **The realtime connection across a token renewal** (`realtime/operatorConnection.test.tsx`, from
  `5-16`): the defect that reached the live deployment, and the resume-on-reconnect and
  resume-on-restart paths around it.
- **The composer's keyboard contract** (`workspace/Composer.test.tsx`): Enter sends, Shift+Enter does
  not, Enter during IME composition does not, Escape clears, an empty draft cannot be sent, and the
  three ways a file gets attached.
- **The conversation view's send and read semantics** (`pages/ConversationPage.test.tsx`): a failed
  send offers a retry, and the retry reuses the same `clientMessageId` when the outcome is *unknown*
  and mints a fresh one when nothing was sent - the difference between the two is invisible on screen
  and produces duplicate messages in a stranger's chat if it regresses. Plus `5-15`'s mark-read rule:
  up to the newest message actually on screen, debounced, and never from a backgrounded tab.

**Deliberately not tested**

- **Anything about appearance.** `11-05`'s component set is styling; there is nothing behavioural to
  assert about a `Badge`, and a test that asserts a class name fails on every restyle while passing
  through every real defect. No snapshots, for the same reason.
- **Coverage as a number.** Not measured and not a target: rendering every component once buys a high
  figure and proves nothing.
- **Layout.** jsdom has no viewport, so whether the thread really scrolls to the newest message, and
  whether the workspace's three regions lay out, are live-verification questions
  (`src/testing/dom.tsx` stubs `scrollIntoView` for exactly that reason).
- **A browser-driving end-to-end suite.** A real option with a real maintenance cost; the behaviours
  above did not need one. Live verification against a running stack stays a required level for any UI
  item, and is a complement to the above rather than a substitute for it.

New screens join one of those two lists rather than neither.
