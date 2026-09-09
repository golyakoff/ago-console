import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { en } from "../i18n/en.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { DocumentsPage } from "./DocumentsPage.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `23-37`: the console screen behind `24-02`/`24-05`'s consent-document mechanism - modeled on
 * `WidgetConfigPage.test.tsx`'s own provider wiring, the identical shape every `site:configure`-gated
 * screen in this codebase already uses.
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
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const siteConsentDocumentsApi = vi.hoisted(() => ({
  fetchSiteConsentDocuments: vi.fn(),
  publishSiteConsentDocument: vi.fn(),
  fetchSiteConsentAcceptances: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/siteConsentDocumentsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/siteConsentDocumentsApi.js")>(
    "../api/siteConsentDocumentsApi.js",
  );
  return { ...actual, ...siteConsentDocumentsApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` - the permission-refusal branch (`AccessRefusal`) renders a
 * `<Link>`, which needs a router context even when the test never navigates. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <DocumentsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function emptyDocuments() {
  return {
    contact: { purpose: "Contact" as const, documentKey: "site-consent-contact-x", versions: [] },
    contactConsentRequired: false,
    marketing: { purpose: "Marketing" as const, documentKey: "site-consent-marketing-x", versions: [] },
  };
}

/** `25-21`: a Contact document with two published versions, current first - the shape every
 * per-version test below needs (a toggle to open, and a second version to prove it does not merge
 * with the first). Marketing gets one version too, deliberately - both panels are then in the
 * "already set" collapsed-form state, so `byText(..., "Publish new version")` cannot ambiguously
 * match a still-open Marketing form's own submit button alongside Contact's reveal toggle; the
 * tests below only care about Contact's own versions and acceptances. */
function twoVersionDocuments() {
  return {
    contact: {
      purpose: "Contact" as const,
      documentKey: "site-consent-contact-x",
      versions: [
        { version: "v2", sequence: 2, title: "Consent v2", publishedAt: "2026-06-01T00:00:00Z" },
        { version: "v1", sequence: 1, title: "Consent v1", publishedAt: "2026-03-01T00:00:00Z" },
      ],
    },
    contactConsentRequired: false,
    marketing: {
      purpose: "Marketing" as const,
      documentKey: "site-consent-marketing-x",
      versions: [{ version: "v1", sequence: 1, title: "Marketing consent v1", publishedAt: "2026-03-01T00:00:00Z" }],
    },
  };
}

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
  siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(emptyDocuments());
  siteConsentDocumentsApi.fetchSiteConsentAcceptances.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("permission gating", () => {
  it("refuses an operator without site:configure, and never calls the read", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's consent documents.");
    expect(siteConsentDocumentsApi.fetchSiteConsentDocuments).not.toHaveBeenCalled();
  });
});

describe("the two consent-document panels", () => {
  it("shows both purposes, and the site-scoped id each call is made with", async () => {
    await render(page());

    expect(siteConsentDocumentsApi.fetchSiteConsentDocuments).toHaveBeenCalledWith("token", SITE_ID);
  });

  it("shows nothing has been published yet for a fresh site", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Nothing published yet.");
  });

  it("shows the current version's title and version label when one exists", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue({
      contact: {
        purpose: "Contact",
        documentKey: "site-consent-contact-x",
        versions: [{ version: "v2", sequence: 2, title: "Consent v2", publishedAt: "2026-03-01T00:00:00Z" }],
      },
      contactConsentRequired: true,
      marketing: { purpose: "Marketing", documentKey: "site-consent-marketing-x", versions: [] },
    });

    const container = await render(page());

    expect(container.textContent).toContain("Consent v2");
    expect(container.textContent).toContain("v2");
  });

  // `23-37`'s own design choice: nothing on this screen may let a tenant believe a published document
  // binds anyone unless something actually enforces it.
  it("warns that the Contact document binds nobody while the widget setting is off", async () => {
    const container = await render(page());

    expect(container.textContent).toContain(
      "Not required yet. Turn on \"Require consent before collecting contact details\"",
    );
  });

  // `23-108`: the assertion above only ever checked the wording, and the wording was pointing at a
  // control that existed nowhere in this console - the phrase appeared exactly once in the whole
  // codebase, in that sentence. Naming a destination is worth nothing if a tenant cannot reach it
  // (`23-107`), so the destination is now a real link and this is what stops it silently becoming
  // prose again.
  it("gives the tenant a link to the screen that carries the setting, not just its name", async () => {
    const container = await render(page());

    const link = all(container, "a").find((a) => a.getAttribute("href") === "/channels/widget");

    expect(link, "the not-required warning must link to the widget screen").toBeTruthy();
    // Asserted against the nav's own string rather than a literal: the point is that the link carries
    // the words the menu uses, so a rename must not be able to make this sentence wrong again.
    expect(link?.textContent).toBe(en.navWidgetAppearance);
  });

  it("states the Contact document is required once the widget setting is on", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue({
      ...emptyDocuments(),
      contactConsentRequired: true,
    });

    const container = await render(page());

    expect(container.textContent).toContain("Required before a visitor's phone number or email is collected");
  });

  it("states the Marketing document is always optional, regardless of the Contact setting", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue({
      ...emptyDocuments(),
      contactConsentRequired: true,
    });

    const container = await render(page());

    expect(container.textContent).toContain("This document is always optional");
  });
});

describe("publishing a new version", () => {
  function titleField(container: HTMLElement, index: number): HTMLInputElement {
    const labels = Array.from(container.querySelectorAll<HTMLLabelElement>(".ago-field__label")).filter(
      (l) => l.textContent === "Title",
    );
    const label = labels[index];
    const id = label?.getAttribute("for");
    const field = id ? document.getElementById(id) : null;
    if (!(field instanceof HTMLInputElement)) {
      throw new Error("Title field not found");
    }
    return field;
  }

  function bodyField(container: HTMLElement, index: number): HTMLTextAreaElement {
    const labels = Array.from(container.querySelectorAll<HTMLLabelElement>(".ago-field__label")).filter(
      (l) => l.textContent === "Text",
    );
    const label = labels[index];
    const id = label?.getAttribute("for");
    const field = id ? document.getElementById(id) : null;
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new Error("Text field not found");
    }
    return field;
  }

  it("publishes the Contact document with the site's own id and the Contact purpose", async () => {
    siteConsentDocumentsApi.publishSiteConsentDocument.mockResolvedValue({
      version: "v1",
      sequence: 1,
      title: "Consent v1",
      publishedAt: "2026-03-01T00:00:00Z",
    });
    const container = await render(page());

    await interact(() => setTextValue(titleField(container, 0), "Consent v1"));
    await interact(() => setTextValue(bodyField(container, 0), "We use your number to text you back."));
    await interact(() => one<HTMLButtonElement>(container, "form button[type='submit']").click());

    expect(siteConsentDocumentsApi.publishSiteConsentDocument).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      "Contact",
      "Consent v1",
      "We use your number to text you back.",
    );
    expect(container.textContent).toContain("Published.");
  });

  it("rejects an empty title before ever calling publish", async () => {
    const container = await render(page());

    await interact(() => setTextValue(bodyField(container, 0), "Some text."));
    await interact(() => one<HTMLButtonElement>(container, "form button[type='submit']").click());

    expect(container.textContent).toContain("A title is required.");
    expect(siteConsentDocumentsApi.publishSiteConsentDocument).not.toHaveBeenCalled();
  });

  it("reloads the document list after a successful publish", async () => {
    siteConsentDocumentsApi.publishSiteConsentDocument.mockResolvedValue({
      version: "v1",
      sequence: 1,
      title: "Consent v1",
      publishedAt: "2026-03-01T00:00:00Z",
    });
    const container = await render(page());
    expect(siteConsentDocumentsApi.fetchSiteConsentDocuments).toHaveBeenCalledTimes(1);

    await interact(() => setTextValue(titleField(container, 0), "Consent v1"));
    await interact(() => setTextValue(bodyField(container, 0), "Body text."));
    await interact(() => one<HTMLButtonElement>(container, "form button[type='submit']").click());

    expect(siteConsentDocumentsApi.fetchSiteConsentDocuments).toHaveBeenCalledTimes(2);
  });
});

/** `25-21`: every "who accepted" test needs a real version to scope the toggle to, so these all start
 * from `twoVersionDocuments()` rather than the fresh-site `emptyDocuments()` the suites above use -
 * a document with nothing published yet has nothing for a per-version toggle to attach to (`current
 * === null` renders no `VersionAcceptancesToggle` at all - proven by `"never renders a who-accepted
 * toggle before a version exists"` below). `all(...).filter(...)` rather than `byText` (which only
 * ever returns the first match) because two versions means two same-labelled toggle buttons - `[0]`
 * is always the current version's (rendered first), `[1]` the next-older one. */
describe("who accepted", () => {
  function acceptanceToggles(container: HTMLElement): HTMLButtonElement[] {
    return all(container, "button").filter(
      (el) => (el.textContent ?? "").trim() === "Show who accepted",
    ) as HTMLButtonElement[];
  }

  it("never renders a who-accepted toggle before a version exists", async () => {
    const container = await render(page());

    expect(byText<HTMLButtonElement>(container, "button", "Show who accepted")).toBeNull();
  });

  it("loads nothing until a version's own toggle is opened", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());

    await render(page());

    expect(siteConsentDocumentsApi.fetchSiteConsentAcceptances).not.toHaveBeenCalled();
  });

  it("loads acceptances for the Contact purpose when a version's own toggle is opened", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    const container = await render(page());

    await interact(() => acceptanceToggles(container)[0]?.click());

    expect(siteConsentDocumentsApi.fetchSiteConsentAcceptances).toHaveBeenCalledWith("token", SITE_ID, "Contact");
  });

  it("shows the privacy note, and never a client IP or user agent column", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    siteConsentDocumentsApi.fetchSiteConsentAcceptances.mockResolvedValue([
      { subjectKind: "Visitor", subjectId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", documentVersion: "v2", acceptedAt: "2026-06-02T00:00:00Z" },
    ]);
    const container = await render(page());

    await interact(() => acceptanceToggles(container)[0]?.click());

    expect(container.textContent).toContain(
      "Shown here: which visitor, which version, and when. Not shown: IP address or browser",
    );
    expect(container.textContent).toContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(container.textContent).not.toContain("203.0.113");
  });

  it("says nobody has accepted yet when the list is empty", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    const container = await render(page());

    await interact(() => acceptanceToggles(container)[0]?.click());

    expect(container.textContent).toContain("Nobody has accepted this document yet.");
  });

  // `25-21`'s own "where this is likely to go wrong": a tenant with two published versions gets two
  // separate acceptance lists, never one merged one - conflating them would misrepresent who agreed
  // to which actual text. `fetchSiteConsentAcceptances` still returns every acceptance for the whole
  // document kind (no version-scoped endpoint exists or is needed - `documentVersion` is already on
  // the wire), so the proof has to be that opening one version's toggle never shows another
  // version's subject id, not merely that the mock was called with the right purpose.
  it("scopes each version's list to its own acceptances - never another version's", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    siteConsentDocumentsApi.fetchSiteConsentAcceptances.mockResolvedValue([
      { subjectKind: "Visitor", subjectId: "v2-accepter-0000-0000-000000000000", documentVersion: "v2", acceptedAt: "2026-06-02T00:00:00Z" },
      { subjectKind: "Visitor", subjectId: "v1-accepter-0000-0000-000000000000", documentVersion: "v1", acceptedAt: "2026-03-02T00:00:00Z" },
    ]);
    const container = await render(page());

    // Captured once, before either click: opening a toggle relabels it "Hide", so re-querying by the
    // "Show who accepted" text after the first click would silently shift what index [1] means.
    const [currentToggle, olderToggle] = acceptanceToggles(container);
    if (!currentToggle || !olderToggle) {
      throw new Error("expected two toggles - one for Contact's current version, one for its older version");
    }

    await interact(() => currentToggle.click());
    expect(container.textContent).toContain("v2-accepter-0000-0000-000000000000");
    expect(container.textContent).not.toContain("v1-accepter-0000-0000-000000000000");

    await interact(() => olderToggle.click());
    expect(container.textContent).toContain("v1-accepter-0000-0000-000000000000");
  });

  it("titles the card with the version's own title, version and publish date - not a bare heading", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    const container = await render(page());

    await interact(() => acceptanceToggles(container)[0]?.click());

    const heading = all(container, "h2").find((h) => (h.textContent ?? "").startsWith("Who accepted"));
    expect(heading?.textContent).toContain("Consent v2");
    expect(heading?.textContent).toContain("(v2,");
  });
});

describe("publishing a new version is a deliberate secondary action once one exists (25-21)", () => {
  it("does not render the publish form by default once a current version exists", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    const container = await render(page());

    expect(all(container, "form").length).toBe(0);
  });

  it("still defaults the form open when nothing has been published yet - there is no read view to show instead", async () => {
    const container = await render(page());

    expect(all(container, "form").length).toBeGreaterThan(0);
  });

  it("reveals the form from its own toggle, and can be cancelled shut again", async () => {
    siteConsentDocumentsApi.fetchSiteConsentDocuments.mockResolvedValue(twoVersionDocuments());
    const container = await render(page());

    const reveal = byText<HTMLButtonElement>(container, "button", "Publish new version");
    if (!reveal) {
      throw new Error("reveal button not found");
    }
    await interact(() => reveal.click());
    expect(all(container, "form").length).toBe(1);

    const cancel = byText<HTMLButtonElement>(container, "button", "Cancel");
    if (!cancel) {
      throw new Error("cancel button not found");
    }
    await interact(() => cancel.click());
    expect(all(container, "form").length).toBe(0);
  });
});

describe("documentsPageIntro (25-21)", () => {
  it("no longer carries the 'AGO never writes the words' sentence aimed at an always-a-form screen", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("These are the documents your own visitors are asked to accept.");
    expect(container.textContent).not.toContain("AGO never writes the words");
  });
});
