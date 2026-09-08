import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { FaqModulePage } from "./FaqModulePage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `19-03`: `/settings/faq` - two independent forms calling two different backends, modeled on
 * `WidgetConfigPage.test.tsx`'s own harness shape byte-for-byte. `config.faqApiBaseUrl` is a real
 * (fake, test-only) URL here so both panels render their real form rather than the "not configured"
 * branch - that branch, and the permission-gated "forbidden" branch both panels share, are
 * `permissionGating.test.tsx`'s own job (`FaqModulePage`'s two new gating tests there), the same split
 * `WidgetConfigPage.test.tsx`/`permissionGating.test.tsx` already establish for that screen.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: "https://faq.test.invalid",
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const modulesApi = vi.hoisted(() => ({ fetchModules: vi.fn(), updateModule: vi.fn() }));
const faqKnowledgeBaseApi = vi.hoisted(() => ({ fetchKnowledgeBase: vi.fn(), updateKnowledgeBase: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/modulesApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
  return { ...actual, ...modulesApi };
});
vi.mock("../api/faqKnowledgeBaseApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/faqKnowledgeBaseApi.js")>(
    "../api/faqKnowledgeBaseApi.js",
  );
  return { ...actual, ...faqKnowledgeBaseApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <FaqModulePage />
      </PermissionsProvider>
    </Signed>
  );
}

/** Finds a field's control by its `<label>` text, the same `htmlFor`-based lookup
 * `WidgetConfigPage.test.tsx`'s own `localeSelect`/`noticeTextField` helpers use rather than a class
 * name (`testing.md`: never assert on structure a restyle would break). */
function fieldByLabel<T extends HTMLElement>(container: HTMLElement, label: string): T {
  const labelEl = byText<HTMLLabelElement>(container, ".ago-field__label", label);
  if (labelEl === null) {
    throw new Error(`no '${label}' field label found`);
  }

  const id = labelEl.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (field === null) {
    throw new Error(`'${label}' field has no control with id='${id}'`);
  }

  return field as T;
}

// `WidgetConfigPage.test.tsx`'s/`ConversationPage.test.tsx`'s own precedent: a direct `.value = x`
// assignment is swallowed by React's tracked setter as "no change", so no `onChange` ever fires -
// going through the *prototype's* setter, then dispatching a real "input" event, is what makes it real.
function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function kbTextField(container: HTMLElement): HTMLTextAreaElement {
  return fieldByLabel<HTMLTextAreaElement>(container, "Knowledge base text");
}

function saveButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button[type='submit']"));
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  modulesApi.fetchModules.mockResolvedValue({ modules: [] });
  modulesApi.updateModule.mockImplementation((_token: string, _siteId: string, dto: unknown) => Promise.resolve(dto));
  faqKnowledgeBaseApi.fetchKnowledgeBase.mockResolvedValue({ text: "", updatedAt: null });
  faqKnowledgeBaseApi.updateKnowledgeBase.mockImplementation((_token: string, _siteId: string, text: string) =>
    Promise.resolve({ text, updatedAt: "2026-08-31T12:00:00+00:00" }),
  );
});

afterEach(async () => {
  await unmount();
});

describe("which products are on this account", () => {
  // `23-84`: this panel used to be a form, and the form never worked - it sent
  // moduleKey/triggerWords/entryPoint while the endpoint also required a credential and a
  // provisioning secret. `23-83` then removed the tenant-facing write routes entirely
  // (`adr/0151`: a tenant never turns a capability on for themselves), so what is left is a read.
  it("says the module is not enabled when this site has none", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Not enabled on this account");
    expect(container.querySelector("input[type='url']")).toBeNull();
  });

  it("names the module and its trigger words when this site has it", async () => {
    modulesApi.fetchModules.mockResolvedValue({
      modules: [{ moduleKey: "faq", triggerWords: ["/faq", "help"], entryPoint: "https://faq.example.com" }],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Enabled");
    expect(container.textContent).toContain("/faq, help");
  });

  it("ignores a differently-keyed module registered for this site", async () => {
    modulesApi.fetchModules.mockResolvedValue({
      modules: [{ moduleKey: "calendar", triggerWords: ["/book"], entryPoint: "https://cal.example.com" }],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Not enabled on this account");
    expect(container.textContent).not.toContain("/book");
  });

  it("offers the tenant no way to write a module registration", async () => {
    const container = await render(page());

    // One submit button on the whole screen - the knowledge base's own, which is a different
    // backend and genuinely the tenant's to edit. The module panel has none.
    expect(saveButtons(container)).toHaveLength(1);
  });
});

describe("the knowledge-base panel", () => {
  it("loads the site's existing knowledge-base text and shows when it was last saved", async () => {
    faqKnowledgeBaseApi.fetchKnowledgeBase.mockResolvedValue({
      text: "We accept returns within 30 days.",
      updatedAt: "2026-08-20T09:00:00+00:00",
    });

    const container = await render(page());

    expect(kbTextField(container).value).toBe("We accept returns within 30 days.");
    expect(container.textContent).toContain("Last saved");
  });

  it("shows the never-saved state when the knowledge base has no updatedAt yet", async () => {
    const container = await render(page());

    expect(kbTextField(container).value).toBe("");
    expect(container.textContent).toContain("Not saved yet.");
  });

  it("saves the knowledge-base text, independently of the module-registration form", async () => {
    const container = await render(page());

    await interact(() => setTextValue(kbTextField(container), "Our shipping costs are..."));
    await interact(() => saveButtons(container)[0]?.click());

    expect(faqKnowledgeBaseApi.updateKnowledgeBase).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      "Our shipping costs are...",
    );
    // `23-84`: there is no module-registration PUT to touch any more - the tenant-facing write
    // routes were removed by `23-83`. Kept as an assertion rather than deleted, because it is now
    // the stronger statement: saving the knowledge base reaches one backend and this screen has no
    // other write at all.
    expect(modulesApi.updateModule).not.toHaveBeenCalled();
  });

  it("reflects the server's saved text and updated-at back into the panel", async () => {
    const container = await render(page());

    await interact(() => setTextValue(kbTextField(container), "Our shipping costs are..."));
    await interact(() => saveButtons(container)[0]?.click());

    expect(kbTextField(container).value).toBe("Our shipping costs are...");
    expect(container.textContent).toContain("Saved.");
    expect(container.textContent).toContain("Last saved");
  });
});
