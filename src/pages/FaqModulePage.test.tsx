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
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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

function moduleKeyField(container: HTMLElement): HTMLInputElement {
  return fieldByLabel<HTMLInputElement>(container, "Module key");
}

function triggerWordsField(container: HTMLElement): HTMLInputElement {
  return fieldByLabel<HTMLInputElement>(container, "Trigger words");
}

function entryPointField(container: HTMLElement): HTMLInputElement {
  return fieldByLabel<HTMLInputElement>(container, "Entry point URL");
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

describe("the module-registration panel", () => {
  it("suggests \"faq\" with empty trigger words and entry point when nothing is registered yet", async () => {
    const container = await render(page());

    expect(moduleKeyField(container).value).toBe("faq");
    expect(triggerWordsField(container).value).toBe("");
    expect(entryPointField(container).value).toBe("");
  });

  it("loads an already-registered faq module's own trigger words and entry point", async () => {
    modulesApi.fetchModules.mockResolvedValue({
      modules: [{ moduleKey: "faq", triggerWords: ["/faq", "/помощь"], entryPoint: "https://faq.example.com" }],
    });

    const container = await render(page());

    expect(moduleKeyField(container).value).toBe("faq");
    expect(triggerWordsField(container).value).toBe("/faq, /помощь");
    expect(entryPointField(container).value).toBe("https://faq.example.com");
  });

  it("ignores a differently-keyed module already registered for this site", async () => {
    // `19-03`'s own generic-modules contract: this screen only ever prefills the "faq"-keyed entry
    // (the module key this screen suggests), not whichever module happens to be first in the list -
    // `20-07`'s own Calendar module could be sitting in this same array.
    modulesApi.fetchModules.mockResolvedValue({
      modules: [{ moduleKey: "calendar", triggerWords: ["/book"], entryPoint: "https://calendar.example.com" }],
    });

    const container = await render(page());

    expect(moduleKeyField(container).value).toBe("faq");
    expect(triggerWordsField(container).value).toBe("");
  });

  it("parses comma-separated trigger words and saves the registration", async () => {
    const container = await render(page());

    await interact(() => setTextValue(triggerWordsField(container), "/faq, /помощь"));
    await interact(() => setTextValue(entryPointField(container), "https://faq.example.com"));
    await interact(() => saveButtons(container)[0]?.click());

    expect(modulesApi.updateModule).toHaveBeenCalledWith("token", SITE_ID, {
      moduleKey: "faq",
      triggerWords: ["/faq", "/помощь"],
      entryPoint: "https://faq.example.com",
    });
  });

  it("rejects a non-https entry point before submitting, and does not call the server", async () => {
    const container = await render(page());

    await interact(() => setTextValue(triggerWordsField(container), "/faq"));
    await interact(() => setTextValue(entryPointField(container), "http://faq.example.com"));
    await interact(() => saveButtons(container)[0]?.click());

    expect(container.textContent).toContain("The entry point must be an absolute https:// URL.");
    expect(modulesApi.updateModule).not.toHaveBeenCalled();
  });

  it("rejects an empty trigger-words field before submitting", async () => {
    const container = await render(page());

    await interact(() => setTextValue(entryPointField(container), "https://faq.example.com"));
    await interact(() => saveButtons(container)[0]?.click());

    expect(container.textContent).toContain("Enter at least one trigger word.");
    expect(modulesApi.updateModule).not.toHaveBeenCalled();
  });

  it("reflects the server's saved registration back into the fields", async () => {
    const container = await render(page());

    await interact(() => setTextValue(triggerWordsField(container), "/faq"));
    await interact(() => setTextValue(entryPointField(container), "https://faq.example.com"));
    await interact(() => saveButtons(container)[0]?.click());

    expect(triggerWordsField(container).value).toBe("/faq");
    expect(container.textContent).toContain("Saved.");
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
    await interact(() => saveButtons(container)[1]?.click());

    expect(faqKnowledgeBaseApi.updateKnowledgeBase).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      "Our shipping costs are...",
    );
    // The module-registration form's own PUT is a different backend and was not touched by saving
    // the knowledge base - the whole point of the two-form split (`FaqModulePage.tsx`'s own doc
    // comment).
    expect(modulesApi.updateModule).not.toHaveBeenCalled();
  });

  it("reflects the server's saved text and updated-at back into the panel", async () => {
    const container = await render(page());

    await interact(() => setTextValue(kbTextField(container), "Our shipping costs are..."));
    await interact(() => saveButtons(container)[1]?.click());

    expect(kbTextField(container).value).toBe("Our shipping costs are...");
    expect(container.textContent).toContain("Saved.");
    expect(container.textContent).toContain("Last saved");
  });
});
