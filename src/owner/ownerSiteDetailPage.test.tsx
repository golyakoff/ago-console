import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSiteDetailPage } from "./OwnerSiteDetailPage.js";
import type { OwnerSiteDetail, OwnerSiteModule, OwnerSiteOperator } from "../api/ownerApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-14`: the per-tenant detail read's own behaviour tests - mirrors `ownerSitesPage.test.tsx`'s
 * setup (same mocked modules, same `Signed` wrapper), since this page is mounted the identical way.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({
  fetchOwnerSiteDetail: vi.fn(),
  // `23-48`: the allowed-origins editor's own write - mocked from the start (rather than added only
  // once a test needs it) so an unrelated test that never touches the editor cannot crash on an
  // unmocked import the way a bare `{}` factory would.
  updateOwnerSiteAllowedOrigins: vi.fn(),
  // `23-65`/`adr/0150`: the grant/revoke screen's own writes - mocked the same way, from the start.
  grantOwnerModule: vi.fn(),
  revokeOwnerModule: vi.fn(),
  // `23-66`: the quantity screen's own write, mocked the same way.
  grantOwnerModuleQuantity: vi.fn(),
  // `23-68`: the operator roster's own restore-seat write, mocked the same way.
  restoreOwnerOperatorSeat: vi.fn(),
}));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "owner-sub", preferred_username: "golyakoff" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function shellAt(siteId: string = SITE_ID) {
  return (
    <MemoryRouter initialEntries={[`/owner/sites/${siteId}`]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/sites/:siteId" element={<OwnerSiteDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

let nextModuleId = 0;

function oneModule(overrides: Partial<OwnerSiteModule> = {}): OwnerSiteModule {
  nextModuleId += 1;
  return {
    id: `module-${nextModuleId}`,
    moduleKey: "calendar",
    triggerWords: ["book-a-table"],
    entryPoint: "https://module.example.com/entry",
    grantedByOwner: true,
    expiresAt: null,
    revokedAt: null,
    status: "Active",
    quantity: null,
    ...overrides,
  };
}

function detail(overrides: Partial<OwnerSiteDetail> = {}): OwnerSiteDetail {
  return {
    siteId: SITE_ID,
    name: "Demo Shop One",
    tier: "free",
    createdAt: "2026-01-01T00:00:00Z",
    seatCount: 2,
    conversationCount: 5,
    recentMessageCount: 10,
    lastMessageAt: "2026-08-27T00:00:00Z",
    attachmentBytes: 1024,
    recentWindowDays: 30,
    modules: [],
    allowedOrigins: ["https://shop.example"],
    operators: [],
    ...overrides,
  };
}

function oneOperator(overrides: Partial<OwnerSiteOperator> = {}): OwnerSiteOperator {
  return {
    operatorId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    displayName: "Jamie Locked-Out",
    email: "jamie@shop.example",
    holdsSeat: false,
    roleNames: ["Operator"],
    ...overrides,
  };
}

let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
  // `23-94`: the same "jsdom has no Clipboard API, every real browser this console ships to does"
  // stand-in `InstallSnippetPage.test.tsx`'s own setup already establishes for its own copy button.
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

afterEach(async () => {
  await unmount();
});

describe("the site detail page's own access states", () => {
  it("renders the tenant's own facts once granted", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Demo Shop One");
    expect(container.textContent).toContain("free");
    expect(container.textContent).toContain(SITE_ID);
  });

  it("shows a refusal, not a table, when the server refuses", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not authorized");
    expect(container.querySelector("table")).toBeNull();
  });

  /** `23-14`'s own Done-when: a genuine 404, distinguishable from a refusal - the platform owner may
   * legitimately name a site that does not exist. */
  it("shows a real not-found state for a site id that does not exist", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-found" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("No such site");
    expect(container.textContent).not.toContain("Not authorized");
  });
});

describe("the site detail page's own entitlements table", () => {
  it("shows a module the owner granted, with its expiry", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({
            moduleKey: "calendar",
            grantedByOwner: true,
            expiresAt: "2026-12-31T00:00:00Z",
            status: "Active",
          }),
        ],
      }),
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("calendar");
    expect(container.textContent).toContain("Platform owner");
    expect(container.textContent).toContain("Active");
  });

  /** A module the tenant enabled must read differently from one the owner granted - never the same
   * label (this item's own Done-when). */
  it("distinguishes a tenant-granted module from an owner-granted one", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", grantedByOwner: true }),
          oneModule({ moduleKey: "faq", grantedByOwner: false }),
        ],
      }),
    });

    const container = await render(shellAt());

    const badges = all(container, "table .ago-badge").map((b) => (b.textContent ?? "").trim());
    expect(badges).toContain("Platform owner");
    expect(badges).toContain("Tenant");
  });

  /** A grant with no expiry renders as an explicit statement, never a blank cell. */
  it("renders a module with no expiry as an explicit 'No end date'", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ expiresAt: null })] }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("No end date");
  });

  /** The item's own most-emphasised Done-when: an expired grant is shown as expired, not omitted -
   * matching what the live read-store query already decided (`status: "Expired"`), never recomputed
   * by this page from `expiresAt` and the browser's own clock. */
  it("shows an expired grant as expired, not omitted from the list", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", expiresAt: "2020-01-01T00:00:00Z", status: "Expired" }),
        ],
      }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("calendar");
    expect(row.textContent).toContain("Expired");
  });

  /** `23-103`: a revoked grant reads "Revoked", never conflated with "Expired" - the two are
   * different facts (a deliberate act versus a grant's own end date quietly arriving), and this test
   * is the console-side half of the precedence `Ago.Chat.Application.Abstractions
   * .EnabledModuleDetailSummary`'s own remarks establish on the server. */
  it("shows a revoked grant as Revoked, not Expired", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({
            moduleKey: "calendar",
            expiresAt: null,
            revokedAt: "2026-09-08T06:33:22Z",
            status: "Revoked",
          }),
        ],
      }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("Revoked");
    expect(row.textContent).not.toContain("Expired");
  });

  /** `adr/0155`: a revoke-then-re-grant leaves two rows for one (site, module) pair, both returned by
   * the same list. Each must render as its own row - not collapse into one because they share a
   * `moduleKey` - proven by a distinguishing fact from each row surviving into the DOM. */
  it("renders two rows for the same module key as two distinct rows", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({
            moduleKey: "calendar",
            expiresAt: null,
            revokedAt: "2026-09-08T06:33:22Z",
            status: "Revoked",
          }),
          oneModule({ moduleKey: "calendar", expiresAt: null, revokedAt: null, status: "Active" }),
        ],
      }),
    });

    const container = await render(shellAt());

    const rows = all(container, "table tbody tr");
    expect(rows).toHaveLength(2);
    const statuses = rows.map((row) => row.textContent ?? "");
    expect(statuses.some((text) => text.includes("Revoked"))).toBe(true);
    expect(statuses.some((text) => text.includes("Active"))).toBe(true);
  });

  it("states in words what an expiry does and does not do", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toMatch(/never told/i);
  });

  it("shows an empty-modules note rather than an empty table when the tenant holds none", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail({ modules: [] }) });

    const container = await render(shellAt());

    expect(container.textContent).toContain("no modules enabled");
    expect(container.querySelector("table")).toBeNull();
  });
});

// `23-48`: the platform owner's own editor - the only place a tenant's allowed origins can be
// changed. This suite is about the editor's own behaviour (what it shows, what it sends, how it
// reports success and refusal); it deliberately never asserts anything about the cache the write
// actually invalidates - that guarantee is proven end to end against real infrastructure in
// `Ago.Chat.Integration.Tests`' `SiteAllowedOriginsCacheInvalidationEndToEndTests`, not here.
describe("the site detail page's own allowed-origins editor", () => {
  it("shows the tenant's current allowed origins, one per line, in the editor", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://shop.example", "https://www.shop.example"] }),
    });

    const container = await render(shellAt());

    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://shop.example\nhttps://www.shop.example");
  });

  it("saves the edited list, and shows the server's own saved value back", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "ok",
      allowedOrigins: ["https://new.example"],
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://new.example");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    expect(ownerApi.updateOwnerSiteAllowedOrigins).toHaveBeenCalledWith("token", SITE_ID, ["https://new.example"]);
    expect(container.textContent).toMatch(/saved/i);
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://new.example");
  });

  /** Blank lines are a typing artifact, not a value the caller meant to send - dropped client-side
   * rather than bounced off the server's own "cannot be empty" guard for a line nobody meant as a
   * real entry. */
  it("drops blank lines before sending", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "ok",
      allowedOrigins: ["https://new.example"],
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://new.example\n\n  \n");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    expect(ownerApi.updateOwnerSiteAllowedOrigins).toHaveBeenCalledWith("token", SITE_ID, ["https://new.example"]);
  });

  /** Fails-before: before the editor read the server's own refusal text, a malformed origin would
   * have either thrown an unhandled error or shown nothing - `23-48`'s own Done-when is that the
   * refusal names what is wrong, not just that something went wrong. */
  it("shows the server's own refusal text inline, next to the field, for a malformed origin", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ allowedOrigins: ["https://old.example"] }),
    });
    ownerApi.updateOwnerSiteAllowedOrigins.mockResolvedValue({
      status: "invalid",
      message: "Allowed origin must not include a path, query string, or fragment.",
    });

    const container = await render(shellAt());
    await setTextarea(container, "https://shop.example/booking");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save allowed origins").click());

    const alert = one<HTMLElement>(container, '[role="alert"]');
    expect(alert.textContent).toContain("path, query string, or fragment");
    // Nothing changed underneath the caller's own edit - a refusal must not quietly revert the
    // field to whatever the server last held.
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    expect(textarea.value).toBe("https://shop.example/booking");
  });
});

// `23-68`: "a locked-out tenant can be let back in without a database" - the operator roster and its
// own restore-seat action, the recovery this item exists to build.
describe("the site detail page's own operator roster", () => {
  it("shows an empty-operators note rather than an empty table when the tenant holds none", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail({ operators: [] }) });

    const container = await render(shellAt());

    expect(container.textContent).toContain("no operators");
  });

  it("shows every operator's seat state and role names, and offers no restore action for a seated operator", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        operators: [
          oneOperator({ operatorId: "seated-1", displayName: "Sam Seated", holdsSeat: true, roleNames: ["Admin"] }),
          oneOperator({ operatorId: "locked-out-1", displayName: "Jamie Locked-Out", holdsSeat: false, roleNames: ["Operator"] }),
        ],
      }),
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Sam Seated");
    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("Jamie Locked-Out");
    expect(container.textContent).toContain("Operator");
    // Exactly one "Restore seat" action - the seated operator's own row offers none.
    expect(all(container, "button").filter((b) => b.textContent === "Restore seat")).toHaveLength(1);
  });

  /** `23-68`'s own scope, made visible: an operator with no role at all is shown plainly, not hidden
   * behind a blank cell - restoring a seat is not restoring a role. */
  it("shows 'No role' for an operator who holds none, rather than a blank cell", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ operators: [oneOperator({ holdsSeat: false, roleNames: [] })] }),
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("No role");
  });

  /** The item's own headline Done-when: the ordinary case needs no dialog, no reason, nothing beyond
   * the click - `force: false` every time, until the server itself says otherwise. */
  it("restores a seat within the seat limit with one click, and reloads the tenant's own detail", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ operators: [oneOperator({ holdsSeat: false })] }),
    });
    ownerApi.restoreOwnerOperatorSeat.mockResolvedValue({
      status: "ok",
      result: { alreadyHeldSeat: false, overrodeSeatLimit: false },
    });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Restore seat").click());

    expect(ownerApi.restoreOwnerOperatorSeat).toHaveBeenCalledWith(
      "token", SITE_ID, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", { force: false, reason: null },
    );
    expect(container.textContent).toMatch(/seat restored/i);
    expect(container.textContent).toMatch(/can sign in again/i);
    // Re-read, the same "the server's own read is the only source for this table" reasoning the
    // grant form's own equivalent test proves.
    expect(ownerApi.fetchOwnerSiteDetail).toHaveBeenCalledTimes(2);
  });

  /** The seat-limit decision, proven from the console's own side: exceeding it opens the override
   * dialog rather than failing silently or guessing client-side - this screen has no seat-count
   * arithmetic of its own (`CLAUDE.md` rule 8), so it can only ever learn this from the server. */
  it("opens the override dialog when the server says the seat limit would be exceeded, and sends no request until a reason is given", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ operators: [oneOperator({ holdsSeat: false })] }),
    });
    ownerApi.restoreOwnerOperatorSeat.mockResolvedValue({
      status: "requires-force",
      message: "Restoring this operator's seat would put the site over its seat limit of 2.",
    });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Restore seat").click());

    const dialog = one<HTMLElement>(container, "dialog[open]");
    expect(dialog.textContent).toContain("seat limit of 2");

    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Override the seat limit").click());
    expect(dialog.textContent).toMatch(/write the reason/i);
    expect(ownerApi.restoreOwnerOperatorSeat).toHaveBeenCalledTimes(1);
  });

  it("overrides the seat limit with force and the typed reason, once one is given", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ operators: [oneOperator({ holdsSeat: false })] }),
    });
    ownerApi.restoreOwnerOperatorSeat.mockResolvedValueOnce({
      status: "requires-force",
      message: "Restoring this operator's seat would put the site over its seat limit of 2.",
    });

    const container = await render(shellAt());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Restore seat").click());
    const dialog = one<HTMLElement>(container, "dialog[open]");

    ownerApi.restoreOwnerOperatorSeat.mockResolvedValueOnce({
      status: "ok",
      result: { alreadyHeldSeat: false, overrodeSeatLimit: true },
    });
    await setTextarea(dialog, "Tenant locked itself out during a live demo; overriding to restore access.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Override the seat limit").click());

    expect(ownerApi.restoreOwnerOperatorSeat).toHaveBeenNthCalledWith(
      2,
      "token",
      SITE_ID,
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      { force: true, reason: "Tenant locked itself out during a live demo; overriding to restore access." },
    );
    expect(container.textContent).toMatch(/put the site over its own seat limit/i);
  });
});

// `23-65`/`adr/0150`: the grant form's own behaviour tests. The provisioning secret never appears
// anywhere in this suite - not in a mocked response, not in an assertion on what was sent - because
// `GrantOwnerModuleDraft` carries no such field for a test to accidentally exercise; that omission is
// itself the console-side half of this item's headline claim, proven the same way `tsc` proves it: a
// field that does not exist cannot be sent.
//
// `23-92`/`adr/0154`: neither does an entry point, for the identical reason - `fillGrantForm` below
// has no "Entry point" input left to fill, and the assertion against what `grantOwnerModule` was
// called with has no such property either.
describe("the site detail page's own grant form", () => {
  it("refuses to submit until an expiry has been chosen - \"never\" is not the default", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());
    await fillGrantForm(container, { chooseExpiry: false });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Grant module").click());

    expect(container.textContent).toMatch(/choose whether this grant expires/i);
    expect(ownerApi.grantOwnerModule).not.toHaveBeenCalled();
  });

  it("grants with no expiry once \"Never expires\" is actively chosen, and reloads the tenant's own detail", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });
    ownerApi.grantOwnerModule.mockResolvedValue({
      status: "ok",
      module: { moduleKey: "calendar", triggerWords: ["/booking"], expiresAt: null },
    });

    const container = await render(shellAt());
    await fillGrantForm(container, { chooseExpiry: "never" });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Grant module").click());

    // `23-92`/`adr/0154`: no `entryPoint` in this call - `fillGrantForm` never types one (there is no
    // such field left to fill), and `GrantOwnerModuleDraft` has no such property to send it under even
    // if it did.
    expect(ownerApi.grantOwnerModule).toHaveBeenCalledWith("token", SITE_ID, {
      moduleKey: "calendar",
      triggerWords: ["/booking"],
      credential: "a-shared-secret-of-sixteen-plus-chars",
      expiresAt: null,
    });
    // `GrantOwnerModuleOutcome`'s own remarks: the response is not spliced into the table locally -
    // the page re-reads the tenant's own detail instead, so the read that was already proven to
    // reflect the server's own `status`/`grantedByOwner` stays the only source for that table.
    expect(ownerApi.fetchOwnerSiteDetail).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own refusal text inline for an invalid grant, without touching the entitlements table", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });
    ownerApi.grantOwnerModule.mockResolvedValue({
      status: "invalid",
      message: "Trigger word '/booking' is already registered to module 'faq' on this site.",
    });

    const container = await render(shellAt());
    await fillGrantForm(container, { chooseExpiry: "never" });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Grant module").click());

    expect(container.textContent).toContain("already registered to module 'faq'");
    expect(ownerApi.fetchOwnerSiteDetail).toHaveBeenCalledTimes(1);
  });

  // `23-94`: the credential field's own "Generate" control - a key-shaped field must not make the
  // platform owner go find a terminal. `input[autocomplete="off"]` is this form's only field with that
  // attribute, so it identifies the credential input whether it is currently masked (`type="password"`,
  // before anything is generated) or in the clear (`type="text"`, after).
  describe("the credential field's own Generate/Copy controls", () => {
    it("starts masked, with no Copy control offered yet", async () => {
      ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

      const container = await render(shellAt());

      const credentialInput = one<HTMLInputElement>(container, 'input[autocomplete="off"]');
      expect(credentialInput.type).toBe("password");
      expect(byText<HTMLButtonElement>(container, "button", "Copy")).toBeNull();
    });

    /** `23-94`'s own headline claim: generating is not the same as saving. This follows one generated
     * value all the way from the click to the exact object `grantOwnerModule` is called with - not
     * merely that *a* value was generated, but that it survived unchanged through render, through
     * `.trim()` in `handleGrantSubmit`, into the request body. */
    it("puts the generated value in the clear, and that exact value reaches the request body", async () => {
      ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });
      ownerApi.grantOwnerModule.mockResolvedValue({
        status: "ok",
        module: { moduleKey: "calendar", triggerWords: ["/booking"], entryPoint: "https://calendar.example.com", expiresAt: null },
      });

      const container = await render(shellAt());
      await setInput(one<HTMLInputElement>(container, 'input[placeholder="calendar"]'), "calendar");
      await setInput(one<HTMLInputElement>(container, 'input[placeholder="/booking"]'), "/booking");

      await interact(() => byText<HTMLButtonElement>(container, "button", "Generate").click());

      const credentialInput = one<HTMLInputElement>(container, 'input[autocomplete="off"]');
      expect(credentialInput.type).toBe("text");
      const generatedValue = credentialInput.value;
      expect(generatedValue.length).toBeGreaterThanOrEqual(16);

      const label = byText<HTMLLabelElement>(container, "label", "Never expires");
      await interact(() => one<HTMLInputElement>(label, 'input[type="radio"]').click());
      await interact(() => byText<HTMLButtonElement>(container, "button", "Grant module").click());

      expect(ownerApi.grantOwnerModule).toHaveBeenCalledWith(
        "token",
        SITE_ID,
        expect.objectContaining({ credential: generatedValue }),
      );
    });

    it("regenerating replaces the value shown - the field never holds two generations at once", async () => {
      ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

      const container = await render(shellAt());

      await interact(() => byText<HTMLButtonElement>(container, "button", "Generate").click());
      const first = one<HTMLInputElement>(container, 'input[autocomplete="off"]').value;

      await interact(() => byText<HTMLButtonElement>(container, "button", "Generate").click());
      const second = one<HTMLInputElement>(container, 'input[autocomplete="off"]').value;

      expect(second).not.toBe(first);
    });

    it("copies exactly the value currently shown, and confirms it", async () => {
      ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

      const container = await render(shellAt());
      await interact(() => byText<HTMLButtonElement>(container, "button", "Generate").click());
      const generatedValue = one<HTMLInputElement>(container, 'input[autocomplete="off"]').value;

      await interact(() => byText<HTMLButtonElement>(container, "button", "Copy").click());

      expect(writeTextMock).toHaveBeenCalledWith(generatedValue);
      expect(byText<HTMLButtonElement>(container, "button", "Copied")).not.toBeNull();
    });

    it("typing a credential by hand still works, and never reveals the field", async () => {
      ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });
      ownerApi.grantOwnerModule.mockResolvedValue({
        status: "ok",
        module: { moduleKey: "calendar", triggerWords: ["/booking"], entryPoint: "https://calendar.example.com", expiresAt: null },
      });

      const container = await render(shellAt());
      await fillGrantForm(container, { chooseExpiry: "never" });
      await interact(() => byText<HTMLButtonElement>(container, "button", "Grant module").click());

      expect(ownerApi.grantOwnerModule).toHaveBeenCalledWith(
        "token",
        SITE_ID,
        expect.objectContaining({ credential: "a-shared-secret-of-sixteen-plus-chars" }),
      );
      // Never generated, so still masked and with nothing to copy - `fillGrantForm` only ever types.
      expect(one<HTMLInputElement>(container, 'input[autocomplete="off"]').type).toBe("password");
    });
  });
});

// `23-65`/`adr/0118`: the revoke dialog's own behaviour tests - provenance decides what the dialog
// asks for, and the asymmetry (`force`/`reason`) is derived from it rather than typed by the platform
// owner.
describe("the site detail page's own revoke dialog", () => {
  it("revokes an owner-granted module with no reason field at all", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", grantedByOwner: true })] }),
    });
    ownerApi.revokeOwnerModule.mockResolvedValue({ status: "ok" });

    const container = await render(shellAt());
    const dialog = await openRevokeDialog(container);

    expect(dialog.querySelector("textarea")).toBeNull();
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Revoke").click());

    expect(ownerApi.revokeOwnerModule).toHaveBeenCalledWith("token", SITE_ID, "calendar", {
      force: false,
      reason: null,
    });
  });

  it("shows provenance before the confirm, and refuses to revoke a tenant's own purchase with a blank reason", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "faq", grantedByOwner: false })] }),
    });

    const container = await render(shellAt());
    const dialog = await openRevokeDialog(container);

    // Provenance is visible before the confirm, not after - `adr/0118`'s own "not recoverable once
    // the row is gone".
    expect(dialog.textContent).toMatch(/purchased this module themselves/i);

    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Revoke").click());

    expect(dialog.textContent).toMatch(/write the reason/i);
    expect(ownerApi.revokeOwnerModule).not.toHaveBeenCalled();
  });

  it("revokes a tenant's own purchase, with force and the typed reason, once one is given", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "faq", grantedByOwner: false })] }),
    });
    ownerApi.revokeOwnerModule.mockResolvedValue({ status: "ok" });

    const container = await render(shellAt());
    const dialog = await openRevokeDialog(container);
    await setTextarea(dialog, "Tenant reported double billing under ticket 412.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Revoke").click());

    expect(ownerApi.revokeOwnerModule).toHaveBeenCalledWith("token", SITE_ID, "faq", {
      force: true,
      reason: "Tenant reported double billing under ticket 412.",
    });
  });

  it("shows the server's own conflict text when a purchase revoke is refused, without closing the dialog", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "faq", grantedByOwner: false })] }),
    });
    ownerApi.revokeOwnerModule.mockResolvedValue({
      status: "requires-force",
      message: "Module 'faq' on this site was purchased by the tenant, not granted by an owner.",
    });

    const container = await render(shellAt());
    const dialog = await openRevokeDialog(container);
    await setTextarea(dialog, "Some reason.");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Revoke").click());

    expect(dialog.textContent).toContain("purchased by the tenant, not granted by an owner");
  });
});

// `23-66`: the quantity dialog's own behaviour tests - both the "zero is not the same as not
// granted" rendering claim and the "lowering states the impact before it acts" flow.
describe("the site detail page's own entitlements table - quantity", () => {
  it("shows 'Not granted' for a module with no quantity grant at all", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: null })] }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("Not granted");
  });

  it("shows a module granted zero as an explicit 0, not as 'Not granted'", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: 0 })] }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).not.toContain("Not granted");
    // The Quantity column specifically, not Expires' own identical-looking "No end date" `.ago-meta` -
    // cell 6 of module/triggerWords/grantedBy/expires/status/quantity/actions.
    expect(row.cells[5]?.textContent).toBe("0");
  });
});

describe("the site detail page's own quantity dialog", () => {
  it("grants a raised quantity directly, with no confirmation step", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: 2 })] }),
    });
    ownerApi.grantOwnerModuleQuantity.mockResolvedValue({ status: "ok", moduleKey: "calendar", quantity: 5 });

    const container = await render(shellAt());
    const dialog = await openQuantityDialog(container);
    await setInput(one<HTMLInputElement>(dialog, 'input[type="number"]'), "5");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Grant quantity").click());

    expect(ownerApi.grantOwnerModuleQuantity).toHaveBeenCalledWith("token", SITE_ID, "calendar", 5);
    expect(container.textContent).toMatch(/granted 5/i);
    expect(ownerApi.fetchOwnerSiteDetail).toHaveBeenCalledTimes(2);
  });

  it("grants a quantity for a module that never had one, from a blank field", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: null })] }),
    });
    ownerApi.grantOwnerModuleQuantity.mockResolvedValue({ status: "ok", moduleKey: "calendar", quantity: 0 });

    const container = await render(shellAt());
    const dialog = await openQuantityDialog(container);
    const input = one<HTMLInputElement>(dialog, 'input[type="number"]');
    expect(input.value).toBe("");
    await setInput(input, "0");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Grant quantity").click());

    expect(ownerApi.grantOwnerModuleQuantity).toHaveBeenCalledWith("token", SITE_ID, "calendar", 0);
  });

  it("states the impact before confirming a lowered quantity, and does not submit until confirmed", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: 5 })] }),
    });

    const container = await render(shellAt());
    const dialog = await openQuantityDialog(container);
    await setInput(one<HTMLInputElement>(dialog, 'input[type="number"]'), "2");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Grant quantity").click());

    // The impact, in words - before anything was sent.
    expect(dialog.textContent).toMatch(/may deactivate up to 3/i);
    expect(ownerApi.grantOwnerModuleQuantity).not.toHaveBeenCalled();

    ownerApi.grantOwnerModuleQuantity.mockResolvedValue({ status: "ok", moduleKey: "calendar", quantity: 2 });
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Confirm lower quantity").click());

    expect(ownerApi.grantOwnerModuleQuantity).toHaveBeenCalledWith("token", SITE_ID, "calendar", 2);
  });

  it("shows the server's own refusal text inline for an invalid quantity", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: 2 })] }),
    });
    ownerApi.grantOwnerModuleQuantity.mockResolvedValue({
      status: "invalid",
      message: "A granted quantity cannot be negative.",
    });

    const container = await render(shellAt());
    const dialog = await openQuantityDialog(container);
    await setInput(one<HTMLInputElement>(dialog, 'input[type="number"]'), "9");
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Grant quantity").click());

    expect(dialog.textContent).toContain("cannot be negative");
  });

  it("refuses to submit a blank quantity, without calling the server", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ moduleKey: "calendar", quantity: null })] }),
    });

    const container = await render(shellAt());
    const dialog = await openQuantityDialog(container);
    await interact(() => byText<HTMLButtonElement>(dialog, "button", "Grant quantity").click());

    expect(dialog.textContent).toMatch(/enter a quantity/i);
    expect(ownerApi.grantOwnerModuleQuantity).not.toHaveBeenCalled();
  });
});

/** Clicks the table row's own "Set quantity" action and returns the dialog it opens. */
async function openQuantityDialog(container: HTMLElement): Promise<HTMLElement> {
  await interact(() => byText<HTMLButtonElement>(container, "button", "Set quantity").click());
  return one<HTMLElement>(container, "dialog[open]");
}

/** Clicks the table row's own "Revoke" action and returns the dialog it opens, scoped so a test's
 * later "Revoke" click reaches the dialog's own confirm button rather than the row's still-mounted
 * trigger - both carry the identical label, and `byText` returns the first match in document
 * order. */
async function openRevokeDialog(container: HTMLElement): Promise<HTMLElement> {
  await interact(() => byText<HTMLButtonElement>(container, "button", "Revoke").click());
  return one<HTMLElement>(container, "dialog[open]");
}

const TEXTAREA_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

async function setTextarea(container: HTMLElement, value: string) {
  const textarea = one<HTMLTextAreaElement>(container, "textarea");
  await interact(() => {
    TEXTAREA_VALUE_DESCRIPTOR?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function setInput(input: HTMLInputElement, value: string) {
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Fills every field of the grant form except (by default) the expiry, so each test opts into
 * exactly the expiry state it means to exercise - `{ chooseExpiry: false }` leaves it unset,
 * `"never"` picks the "Never expires" radio. Field values are fixed rather than parameterised: no
 * test in this file needs them to vary, only the expiry choice and the mocked outcome do. */
async function fillGrantForm(container: HTMLElement, options: { chooseExpiry: false | "never" }) {
  await setInput(one<HTMLInputElement>(container, 'input[placeholder="calendar"]'), "calendar");
  await setInput(one<HTMLInputElement>(container, 'input[placeholder="/booking"]'), "/booking");
  await setInput(one<HTMLInputElement>(container, 'input[type="password"]'), "a-shared-secret-of-sixteen-plus-chars");

  if (options.chooseExpiry === "never") {
    const label = byText<HTMLLabelElement>(container, "label", "Never expires");
    if (label === null) {
      throw new Error("no 'Never expires' label found");
    }
    await interact(() => one<HTMLInputElement>(label, 'input[type="radio"]').click());
  }
}
