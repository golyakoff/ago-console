import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponse, type User } from "oidc-client-ts";
import { CallbackPage } from "./CallbackPage.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `10-03`: **the three states, as routing.** Before this item the callback had two - a token or a
 * failure - and every token it had ever seen belonged to an already-provisioned operator. Self
 * registration adds a third that looks identical from the browser's side: a real, signature-valid
 * Keycloak identity whose `sub` matches no `operators` row.
 *
 * Getting the split wrong is invisible in the way that matters. A freshly-registered visitor sent
 * to the queue sees an empty screen and a hub connection that will not open, with nothing naming
 * the reason; an existing operator sent to `/onboarding` is asked to create a second site the
 * server will refuse. Neither is an exception anything logs, and both are one `if` away from each
 * other.
 *
 * These assert the *destination*, through a real router, rather than that `navigate` was called
 * with a string - the route that renders is the behaviour, and `App.tsx` is free to move the
 * queue's path without this file lying about it.
 *
 * `12-04`: **a fourth destination, and the three that already existed pinned rather than assumed.**
 * The platform owner has no `operators` row by `adr/0032`'s own decision, so `resolveOperatorState`
 * answers `"keycloak-identity-only"` for them exactly as it does for a brand-new registrant - and the
 * console sent them to a form that would have made them an operator forever. The split that fixes it
 * is one more `if` away from each of the other three in the same way `10-03`'s was, which is why the
 * unchanged cases below are asserted rather than assumed: the failure this fix could most easily
 * cause is a registrant or an established operator ending up on `/owner`.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const userManager = vi.hoisted(() => ({
  userManager: { signinRedirectCallback: vi.fn() },
  keycloakRegistrationRedirect: vi.fn(),
}));
const operatorsApi = vi.hoisted(() => ({ resolveOperatorState: vi.fn(), fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn(), fetchOwnerSites: vi.fn() }));

vi.mock("../auth/userManager.js", () => userManager);
vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);

/** A token carrying nothing about operators - which is the honest shape: Keycloak signs identity,
 * and `adr/0022`'s resolve-at-request-time model means `OperatorId`/`SiteId` are never in it. */
function tokenBack(): User {
  return { access_token: "fresh-access-token", profile: { sub: "keycloak-sub" } } as unknown as User;
}

function app() {
  return (
    <MemoryRouter initialEntries={["/callback"]}>
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/" element={<p>the queue</p>} />
        <Route path="/onboarding" element={<p>set up your site</p>} />
        <Route path="/owner" element={<p>platform sites</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  userManager.userManager.signinRedirectCallback.mockResolvedValue(tokenBack());
  // The answer for everybody but one person on the deployment, so it is the default here and the
  // owner case sets its own - which also keeps every pre-`12-04` case above behaving as it did.
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("landing back from Keycloak", () => {
  it("takes an existing operator to the queue - state (a), unchanged", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("operator");

    const container = await render(app());

    expect(container.textContent).toContain("the queue");
  });

  it("takes a just-registered identity to the site setup form - state (b)", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");

    const container = await render(app());

    expect(container.textContent).toContain("set up your site");
  });

  it("routes on the server's answer, using the token it was handed and nothing in it", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("operator");

    const container = await render(app());

    // The token above carries no operator claim of any kind, and this still lands in the queue:
    // the destination came from the server, which is the item's own rule (`10-03`: "the console
    // must not re-derive server-side authorization logic itself").
    expect(operatorsApi.resolveOperatorState).toHaveBeenCalledWith("fresh-access-token");
    expect(container.textContent).toContain("the queue");
  });

  it("says the sign-in failed when the code exchange is rejected - state (c), unchanged", async () => {
    userManager.userManager.signinRedirectCallback.mockRejectedValue(new Error("invalid_grant"));

    const container = await render(app());

    expect(container.textContent).toContain("Sign-in failed");
    expect(container.textContent).toContain("invalid_grant");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(container.textContent).not.toContain("set up your site");
    // Nothing to ask about: there is no token.
    expect(operatorsApi.resolveOperatorState).not.toHaveBeenCalled();
  });

  it("fails closed - without navigating anywhere - when the server cannot answer at all", async () => {
    // The API being down is not evidence of a fresh signup, and sending an established operator to
    // a registration form during an outage would have them create a second site as soon as it came
    // back - unchanged by `11-17`, which only changed the *wording* of this same case (below).
    operatorsApi.resolveOperatorState.mockRejectedValue(new Error("Failed to resolve operator identity: 500"));

    const container = await render(app());

    expect(container.textContent).not.toContain("set up your site");
    expect(container.textContent).not.toContain("the queue");
  });

  it("waits rather than showing either destination while the answer is in flight", async () => {
    operatorsApi.resolveOperatorState.mockReturnValue(new Promise(() => undefined));

    const container = await render(app());

    expect(container.querySelector("[role='status']")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(container.textContent).not.toContain("set up your site");
  });
});

/**
 * `12-04`. `adr/0032` is explicit that the platform owner holds no `operators` row, so the answer
 * these tests start from - `"keycloak-identity-only"` - is *identical* for the owner and for a
 * just-registered visitor. Everything separating them is the second question, and it is asked of the
 * server: `probeOwnerEligibility` is `12-01`'s `RequirePlatformOwner` decision read back off
 * `12-02`'s endpoint, never a claim this console read out of the token.
 */
describe("the identity with no operators row is two identities", () => {
  it("takes the platform owner to the owner view - state (d), new", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");
    ownerApi.probeOwnerEligibility.mockResolvedValue("eligible");

    const container = await render(app());

    expect(container.textContent).toContain("platform sites");
    // The point of the item: never the form, whose button commits an `operators` row for this `sub`
    // that nothing in the product can remove.
    expect(container.textContent).not.toContain("set up your site");
    expect(ownerApi.probeOwnerEligibility).toHaveBeenCalledWith("fresh-access-token");
  });

  it("still takes a just-registered identity to the site setup form - state (b), unchanged", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");
    ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");

    const container = await render(app());

    expect(container.textContent).toContain("set up your site");
    expect(container.textContent).not.toContain("platform sites");
  });

  it("never asks about the owner for an established operator - state (a) costs no extra request", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("operator");

    const container = await render(app());

    expect(container.textContent).toContain("the queue");
    // Not merely "does not route to /owner": an operator is routed before the second question is
    // asked at all. Holding an `operators` row and holding Keycloak's realm role are orthogonal -
    // the author's own account on this deployment holds both, which is why `12-03` never hit this -
    // and the operator answer deliberately wins outright rather than being ranked against the other.
    expect(ownerApi.probeOwnerEligibility).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("platform sites");
  });

  it("sends the identity to the setup form when the owner probe cannot answer", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");
    ownerApi.probeOwnerEligibility.mockResolvedValue("unknown");

    const container = await render(app());

    // Deliberately not either error screen `resolveOperatorState`'s own failure can produce
    // (`11-17`'s "sign-in" or "operator-lookup" alert). That call decides between a queue and a form
    // and guessing wrong strands somebody; this one decides between a form and a read-only view, and
    // its wrong answer is a form the server refuses and a page that explains itself. Failing back to
    // exactly where this state went before `12-04` means an owner-endpoint outage cannot change any
    // ordinary registrant's destination.
    expect(container.textContent).toContain("set up your site");
    expect(container.textContent).not.toContain("Sign-in failed");
  });

  it("sends the identity to the setup form when the owner probe throws", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");
    ownerApi.probeOwnerEligibility.mockRejectedValue(new TypeError("Failed to fetch"));

    const container = await render(app());

    expect(container.textContent).toContain("set up your site");
    expect(container.textContent).not.toContain("Sign-in failed");
  });
});

/**
 * `11-17` (`ago-root#383`). Found 2026-09-03: a CORS-refused `GET /api/v1/operators/me` after a
 * *successful* sign-in rendered "Sign-in failed / Failed to fetch", and separately a reloaded
 * `/callback` URL (an already-consumed `code`/`state`) rendered the identical text for an unrelated
 * reason. Both misdirected whoever read them. These three tests are the three things that message
 * used to conflate, each now told apart - see `CallbackPage.tsx`'s own doc comment on the
 * `resolveOperatorState` `catch`, and `../auth/replayedCallback.ts`'s own doc comment on
 * `isReplayedCallback`, for the full reasoning - including the fragile string-match hinge the replay
 * case rests on, and `replayedCallback.test.ts`'s canary against the real library that guards it.
 */
describe("the message names which of three things actually failed", () => {
  it("names the API, not Keycloak, when it fails after a successful sign-in", async () => {
    // The exact shape of the CORS-refusal from `ago-root#383`: `fetch` itself rejects, which is what
    // a browser blocking a cross-origin response for having no `Access-Control-Allow-Origin` header
    // looks like from calling code - there is no response to read a status off, just a `TypeError`.
    operatorsApi.resolveOperatorState.mockRejectedValue(new TypeError("Failed to fetch"));

    const container = await render(app());

    // Not "Sign-in failed" - Keycloak's own round trip already succeeded by the time this call runs.
    expect(container.textContent).not.toContain("Sign-in failed");
    expect(container.textContent).toContain("Signed in");
    // Names the endpoint, so the reader does not have to go looking for which call broke.
    expect(container.textContent).toContain("/api/v1/operators/me");
    // The browser's own wording still appears - as evidence inside the explanation, not as the
    // entire message the way it was before this item.
    expect(container.textContent).toContain("Failed to fetch");
    // `11-05`'s accessibility floor: still an assertive live region, for either failure kind.
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(container.textContent).not.toContain("set up your site");
  });

  it("sends the operator back to sign in, with no error box, when the callback is replayed", async () => {
    // The exact shape of a reload: `signinRedirectCallback()` already consumed and removed this
    // `state` from `sessionStorage` the first time it ran, so the second run finds nothing to match
    // it against - `oidc-client-ts`'s own `readSigninResponseState`, verbatim message.
    userManager.userManager.signinRedirectCallback.mockRejectedValue(new Error("No matching state found in storage"));

    const container = await render(app());

    // The point of the item: no red box at all, not merely different words in one.
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.textContent).not.toContain("Sign-in failed");
    expect(container.textContent).not.toContain("Failed to fetch");
    // Never asked - there is no token to ask it with.
    expect(operatorsApi.resolveOperatorState).not.toHaveBeenCalled();
  });

  it("also treats a stale bookmark with no state at all as a replay, not an error", async () => {
    // The other message `readSigninResponseState` throws for the same reason - a `/callback` URL
    // with no `state` param at all, staler still than a same-session reload.
    userManager.userManager.signinRedirectCallback.mockRejectedValue(new Error("No state in response"));

    const container = await render(app());

    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.textContent).not.toContain("Sign-in failed");
  });

  it("still reads as a sign-in failure when Keycloak genuinely refuses", async () => {
    // The real shape of a refusal `oidc-client-ts` produces: its own exported `ErrorResponse` class,
    // thrown when the redirect back from Keycloak itself carries an `error` parameter (the user
    // cancelled, the account is disabled, consent was denied - `OidcClient`'s own
    // `_processSigninState`). Distinct from the plain `Error` the two replay cases above throw, and
    // that distinction - `instanceof`, not text - is what `isReplayedCallback` relies on to never
    // mistake this for a replay.
    userManager.userManager.signinRedirectCallback.mockRejectedValue(
      new ErrorResponse({ error: "access_denied", error_description: "The user denied consent." }),
    );

    const container = await render(app());

    expect(container.textContent).toContain("Sign-in failed");
    expect(container.textContent).toContain("The user denied consent.");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(operatorsApi.resolveOperatorState).not.toHaveBeenCalled();
  });
});

