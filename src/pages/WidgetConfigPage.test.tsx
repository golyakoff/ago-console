import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { WidgetConfigPage } from "./WidgetConfigPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `11-10`: the console half of "the widget speaks the tenant's chosen language" - the one new
 * `Select` this item adds to `WidgetConfigPage`, modeled on the launcher-position control already
 * proven by `permissionGating.test.tsx` (which covers the page's `site:configure` gate and is not
 * repeated here). What is new here is the field itself: it loads the site's current locale, and
 * saving sends the chosen one back alongside color and position in the one existing PUT.
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
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
// `13-07`: `PermissionsProvider` now calls this before `fetchMyPermissions` - unmocked, it would hit
// a real `fetch` against `config.apiBaseUrl` and this file's own single-tenant fixture would never
// reach the widget-config screen at all. One tenancy, matching every operator this file's own
// fixtures already model.
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const widgetConfigApi = vi.hoisted(() => ({ fetchWidgetConfig: vi.fn(), updateWidgetConfig: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/widgetConfigApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/widgetConfigApi.js")>("../api/widgetConfigApi.js");
  return { ...actual, ...widgetConfigApi };
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
        <WidgetConfigPage />
      </PermissionsProvider>
    </Signed>
  );
}

/** The `<select>` for "Widget language" - found via its `<label>`'s `htmlFor`, matching `Field`'s
 * own wiring, not by class name (`testing.md`: never assert on structure a restyle would break). */
function localeSelect(container: HTMLElement): HTMLSelectElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Widget language");
  if (label === null) {
    throw new Error("no 'Widget language' field label found");
  }

  const id = label.getAttribute("for");
  const select = id ? document.getElementById(id) : null;
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("'Widget language' field is not a <select>");
  }

  return select;
}

/** `16-04`: the notice text/url fields, found the same `<label>`-`htmlFor` way as `localeSelect`
 * above, never by class name. */
function noticeTextField(container: HTMLElement): HTMLTextAreaElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Notice text (optional)");
  if (label === null) {
    throw new Error("no 'Notice text (optional)' field label found");
  }

  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("'Notice text (optional)' field is not a <textarea>");
  }

  return field;
}

function noticeUrlField(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Notice link (optional)");
  if (label === null) {
    throw new Error("no 'Notice link (optional)' field label found");
  }

  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLInputElement)) {
    throw new Error("'Notice link (optional)' field is not an <input>");
  }

  return field;
}

// `ConversationPage.test.tsx`'s own precedent (its long comment has the full reasoning): a direct
// `.value = x` assignment is swallowed by React's own tracked setter as "no change", so no `onChange`
// ever fires - going through the *prototype's* setter, then dispatching a real "input" event (not
// "change" - that is what a `<select>` uses, not a text `<input>`/`<textarea>`), is what makes it real.
function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
    siteId: SITE_ID,
    primaryColorHex: null,
    position: "BottomRight",
    locale: "Ru",
    noticeText: null,
    noticeUrl: null,
    attractAttention: false,
    autoOpenEnabled: false,
    autoOpenDelaySeconds: 30,
    autoOpenGreetingText: null,
  });
  widgetConfigApi.updateWidgetConfig.mockImplementation((_token: string, _siteId: string, dto: unknown) =>
    Promise.resolve(dto),
  );
});

afterEach(async () => {
  await unmount();
});

describe("the widget language field", () => {
  it("loads the site's current language into the select", async () => {
    const container = await render(page());

    expect(localeSelect(container).value).toBe("Ru");
  });

  it("saves the chosen language alongside the existing color and position, in one PUT", async () => {
    const container = await render(page());

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ position: "BottomRight", locale: "En" }),
    );
  });

  /**
   * `23-108`. This is the half of the defect that had no symptom yet. `WidgetConfigDto` did not carry
   * `requireContactConsent` while the server's `UpdateWidgetConfigRequest` takes a non-nullable
   * `bool`, and this page `JSON.stringify`s that object as the entire PUT body - so an absent property
   * bound to `false` and **saving a colour would have switched off a consent gate the API genuinely
   * enforces**. It was harmless only because nothing in the console could turn the gate on, which is
   * the other half of the same item.
   *
   * So the assertion is deliberately about a save that has nothing to do with consent: change the
   * language, and the flag the server sent must come back unchanged in the request. A future PUT that
   * drops the field again fails here rather than quietly clearing a tenant's setting.
   */
  it("carries the consent flag through a save that never touched it", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "Ru",
      noticeText: null,
      noticeUrl: null,
      requireContactConsent: true,
    });

    const container = await render(page());

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ locale: "En", requireContactConsent: true }),
    );
  });

  it("reflects the server's saved language back into the select", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({ primaryColorHex: null, position: "BottomRight", locale: "En" });

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(localeSelect(container).value).toBe("En");
    expect(container.textContent).toContain("Saved.");
  });
});

/**
 * `16-04`: the console half of the widget's processing notice - two more optional fields on the same
 * screen, saved through the same one PUT `updateWidgetConfig` already makes. Modeled on "the widget
 * language field" block above, which is `11-10`'s own precedent for adding a field to this screen.
 */
describe("the widget processing notice fields", () => {
  it("loads the site's current notice text and link into the fields", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      siteId: SITE_ID,
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: "We read what you send us.",
      noticeUrl: "https://tenant.example/privacy",
    });
    const container = await render(page());

    expect(noticeTextField(container).value).toBe("We read what you send us.");
    expect(noticeUrlField(container).value).toBe("https://tenant.example/privacy");
  });

  it("leaves both fields empty when the site has never configured a notice", async () => {
    const container = await render(page());

    expect(noticeTextField(container).value).toBe("");
    expect(noticeUrlField(container).value).toBe("");
  });

  it("saves the notice text and link alongside color, position, and language, in one PUT", async () => {
    const container = await render(page());

    await interact(() => setTextValue(noticeTextField(container), "We use your messages to answer your questions."));
    await interact(() => setTextValue(noticeUrlField(container), "https://tenant.example/privacy"));
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({
        position: "BottomRight",
        noticeText: "We use your messages to answer your questions.",
        noticeUrl: "https://tenant.example/privacy",
      }),
    );
  });

  it("sends null for both fields when left empty", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      siteId: SITE_ID,
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: "Was set before.",
      noticeUrl: "https://tenant.example/privacy",
    });
    const container = await render(page());

    await interact(() => setTextValue(noticeTextField(container), ""));
    await interact(() => setTextValue(noticeUrlField(container), ""));
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ noticeText: null, noticeUrl: null }),
    );
  });

  // `16-04`'s own Scope: the URL is validated `https://` only, UX-only (the server is the real gate,
  // `widgetConfigValidation.ts`'s own doc comment) - a bad link is caught before the request is even
  // sent, the same posture the color field's own validation test (not duplicated here) already proves.
  it("rejects a non-https link before submitting, and sends nothing", async () => {
    const container = await render(page());

    await interact(() => setTextValue(noticeUrlField(container), "http://tenant.example/privacy"));
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(container.textContent).toContain("The link must be an absolute https:// URL.");
    expect(widgetConfigApi.updateWidgetConfig).not.toHaveBeenCalled();
  });

  it("reflects the server's saved notice back into the fields", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: "We read what you send us.",
      noticeUrl: "https://tenant.example/privacy",
    });

    await interact(() => setTextValue(noticeTextField(container), "We read what you send us."));
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(noticeTextField(container).value).toBe("We read what you send us.");
    expect(noticeUrlField(container).value).toBe("https://tenant.example/privacy");
    expect(container.textContent).toContain("Saved.");
  });
});

/** `23-63`: the "Attract attention while closed" checkbox, found by its own label text the same
 * `byText`-then-walk-to-the-control way `OfflineAutoReplyPage`'s own enabled toggle would be found -
 * a plain `<label className="ago-row">` wrapping the `<input>`, not a `Field`-wired `htmlFor`/`id`
 * pair like the select/textarea fields above. */
/** `23-64`: the auto-open checkbox, delay `<select>` and greeting `<textarea>`, found the same
 * "label/htmlFor, never by class name" way every other field on this page's own test file already
 * uses. */
function autoOpenCheckbox(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, "label", "Open the widget automatically");
  if (label === null) {
    throw new Error("no 'Open the widget automatically' label found");
  }

  const input = label.querySelector("input[type='checkbox']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("'Open the widget automatically' label has no checkbox");
  }

  return input;
}

function autoOpenDelaySelect(container: HTMLElement): HTMLSelectElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Delay before opening");
  if (label === null) {
    throw new Error("no 'Delay before opening' field label found");
  }

  const id = label.getAttribute("for");
  const select = id ? document.getElementById(id) : null;
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("'Delay before opening' field is not a <select>");
  }

  return select;
}

function autoOpenGreetingField(container: HTMLElement): HTMLTextAreaElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Greeting text");
  if (label === null) {
    throw new Error("no 'Greeting text' field label found");
  }

  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("'Greeting text' field is not a <textarea>");
  }

  return field;
}

function attractAttentionCheckbox(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, "label", "Attract attention while closed");
  if (label === null) {
    throw new Error("no 'Attract attention while closed' label found");
  }

  const input = label.querySelector("input[type='checkbox']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("'Attract attention while closed' label has no checkbox");
  }

  return input;
}

/** `25-39`: the "Booking (temporary)" panel's own checkbox, found the identical way
 * `attractAttentionCheckbox` above is. */
function acceptUnverifiedPhoneCheckbox(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, "label", "Accept an unverified phone number for now");
  if (label === null) {
    throw new Error("no 'Accept an unverified phone number for now' label found");
  }

  const input = label.querySelector("input[type='checkbox']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("'Accept an unverified phone number for now' label has no checkbox");
  }

  return input;
}

/**
 * `23-63`: the console half of the item - a checkbox, off by default, saved through the same one PUT
 * every other field on this screen already uses. Modeled on "the widget language field" block above.
 */
describe("the widget attract-attention checkbox", () => {
  it("is off by default when the site has never turned it on", async () => {
    const container = await render(page());

    expect(attractAttentionCheckbox(container).checked).toBe(false);
  });

  it("loads the site's current setting into the checkbox", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      siteId: SITE_ID,
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      attractAttention: true,
    });
    const container = await render(page());

    expect(attractAttentionCheckbox(container).checked).toBe(true);
  });

  it("saves the chosen setting alongside every other field, in one PUT", async () => {
    const container = await render(page());

    await interact(() => attractAttentionCheckbox(container).click());
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ position: "BottomRight", attractAttention: true }),
    );
  });

  it("reflects the server's saved setting back into the checkbox", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      attractAttention: true,
    });

    await interact(() => attractAttentionCheckbox(container).click());
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(attractAttentionCheckbox(container).checked).toBe(true);
    expect(container.textContent).toContain("Saved.");
  });

  // `23-63`'s own scope: "for some people repeated motion is a symptom trigger" - the console's own
  // copy must say the setting can be silently overridden, not merely toggle a switch and imply that
  // is the whole story.
  it("states in words that reduced motion overrides this setting regardless", async () => {
    const container = await render(page());

    expect(container.textContent).toMatch(/reduced motion/i);
  });
});

/**
 * `25-39`: the "Booking (temporary)" panel's own checkbox - off by default, saved through the same
 * one PUT every other field on this screen already uses, modeled on "the widget attract-attention
 * checkbox" block above.
 */
describe("the accept-unverified-phone-booking checkbox", () => {
  it("is off by default when the site has never turned it on", async () => {
    const container = await render(page());

    expect(acceptUnverifiedPhoneCheckbox(container).checked).toBe(false);
  });

  it("loads the site's current setting into the checkbox", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      siteId: SITE_ID,
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      acceptUnverifiedPhone: true,
    });
    const container = await render(page());

    expect(acceptUnverifiedPhoneCheckbox(container).checked).toBe(true);
  });

  it("saves the chosen setting alongside every other field, in one PUT", async () => {
    const container = await render(page());

    await interact(() => acceptUnverifiedPhoneCheckbox(container).click());
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ position: "BottomRight", acceptUnverifiedPhone: true }),
    );
  });

  it("reflects the server's saved setting back into the checkbox", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      acceptUnverifiedPhone: true,
    });

    await interact(() => acceptUnverifiedPhoneCheckbox(container).click());
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(acceptUnverifiedPhoneCheckbox(container).checked).toBe(true);
    expect(container.textContent).toContain("Saved.");
  });

  // `23-108`'s own regression shape, restated for this field: a save that never touched this
  // checkbox must still send back whatever the server last reported, not silently drop it to
  // `false` - the exact defect class this page's own PUT-the-whole-object shape can reintroduce for
  // any boolean field, proven once per field rather than assumed general.
  it("carries the setting through a save that never touched it", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "Ru",
      noticeText: null,
      noticeUrl: null,
      acceptUnverifiedPhone: true,
    });

    const container = await render(page());

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ locale: "En", acceptUnverifiedPhone: true }),
    );
  });

  // `25-39`'s own Done-when: the console must state plainly why the setting exists and that it is
  // temporary, not present it as an ordinary feature toggle.
  it("states in words that this is a temporary workaround for a missing verification provider", async () => {
    const container = await render(page());

    expect(container.textContent).toMatch(/temporary/i);
  });
});

/**
 * `23-64`: the console half of the item - a checkbox (off by default), a delay `<select>` (the
 * closed six-value set), and a greeting `<textarea>` with no default text, saved through the same one
 * PUT every other field on this screen already uses. Modeled on "the widget attract-attention
 * checkbox" block above.
 */
describe("the widget auto-open fields", () => {
  it("is off by default, with the default delay, when the site has never turned it on", async () => {
    const container = await render(page());

    expect(autoOpenCheckbox(container).checked).toBe(false);
    expect(autoOpenDelaySelect(container).value).toBe("30");
    expect(autoOpenGreetingField(container).value).toBe("");
  });

  it("loads the site's current setting into the checkbox, select and greeting field", async () => {
    widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
      siteId: SITE_ID,
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      attractAttention: false,
      autoOpenEnabled: true,
      autoOpenDelaySeconds: 60,
      autoOpenGreetingText: "Hi, need any help?",
    });
    const container = await render(page());

    expect(autoOpenCheckbox(container).checked).toBe(true);
    expect(autoOpenDelaySelect(container).value).toBe("60");
    expect(autoOpenGreetingField(container).value).toBe("Hi, need any help?");
  });

  it("saves the chosen setting alongside every other field, in one PUT", async () => {
    const container = await render(page());

    await interact(() => autoOpenCheckbox(container).click());
    setTextValue(autoOpenGreetingField(container), "Hi, need any help?");
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({
        position: "BottomRight",
        autoOpenEnabled: true,
        autoOpenDelaySeconds: 30,
        autoOpenGreetingText: "Hi, need any help?",
      }),
    );
  });

  it("reflects the server's saved setting back into the fields", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({
      primaryColorHex: null,
      position: "BottomRight",
      locale: "En",
      noticeText: null,
      noticeUrl: null,
      attractAttention: false,
      autoOpenEnabled: true,
      autoOpenDelaySeconds: 90,
      autoOpenGreetingText: "Hi, need any help?",
    });

    await interact(() => autoOpenCheckbox(container).click());
    setTextValue(autoOpenGreetingField(container), "Hi, need any help?");
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(autoOpenCheckbox(container).checked).toBe(true);
    expect(autoOpenDelaySelect(container).value).toBe("90");
    expect(container.textContent).toContain("Saved.");
  });

  // `23-64`'s own Scope: "There is no default sentence we supply" - this is this file's fails-before
  // proof for the client-side half of that guard (`Ago.Chat.Domain.WidgetConfig`'s own constructor is
  // the server-side half, covered by `ago-chat`'s `UpdateWidgetConfigHandlerTests`). Turning auto-open
  // on with an empty greeting must be caught before the request is even sent, not discovered as a
  // rejected PUT.
  it("rejects turning auto-open on with an empty greeting, and sends nothing", async () => {
    const container = await render(page());

    await interact(() => autoOpenCheckbox(container).click());
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(container.textContent).toMatch(/needs a greeting/i);
    expect(widgetConfigApi.updateWidgetConfig).not.toHaveBeenCalled();
  });

  // The identical guard, but for whitespace-only text - not merely an empty string.
  it("rejects turning auto-open on with a whitespace-only greeting, and sends nothing", async () => {
    const container = await render(page());

    await interact(() => autoOpenCheckbox(container).click());
    setTextValue(autoOpenGreetingField(container), "   ");
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(container.textContent).toMatch(/needs a greeting/i);
    expect(widgetConfigApi.updateWidgetConfig).not.toHaveBeenCalled();
  });

  // Leaving auto-open off is always valid, whatever the greeting field happens to hold - the guard
  // above is conditional on the checkbox, not unconditional on the field.
  it("allows saving with an empty greeting when auto-open stays off", async () => {
    const container = await render(page());

    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ autoOpenEnabled: false, autoOpenGreetingText: null }),
    );
  });

  it("offers exactly the six delays the backlog item fixes, in ascending order", async () => {
    const container = await render(page());

    const options = Array.from(autoOpenDelaySelect(container).querySelectorAll("option")).map(
      (o) => o.value,
    );

    expect(options).toEqual(["15", "30", "45", "60", "90", "120"]);
  });
});
