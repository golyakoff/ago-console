import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { DocumentsPage } from "./DocumentsPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
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
      "Not required yet - turn on \"Require consent before collecting contact details\"",
    );
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

describe("who accepted", () => {
  it("loads nothing until the toggle is opened", async () => {
    await render(page());

    expect(siteConsentDocumentsApi.fetchSiteConsentAcceptances).not.toHaveBeenCalled();
  });

  it("loads acceptances for the Contact purpose when its own toggle is opened", async () => {
    const container = await render(page());
    const toggle = byText<HTMLButtonElement>(container, "button", "Show who accepted");
    if (!toggle) {
      throw new Error("toggle button not found");
    }

    await interact(() => toggle.click());

    expect(siteConsentDocumentsApi.fetchSiteConsentAcceptances).toHaveBeenCalledWith("token", SITE_ID, "Contact");
  });

  it("shows the privacy note, and never a client IP or user agent column", async () => {
    siteConsentDocumentsApi.fetchSiteConsentAcceptances.mockResolvedValue([
      { subjectKind: "Visitor", subjectId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", documentVersion: "v1", acceptedAt: "2026-03-02T00:00:00Z" },
    ]);
    const container = await render(page());
    const toggle = byText<HTMLButtonElement>(container, "button", "Show who accepted");
    if (!toggle) {
      throw new Error("toggle button not found");
    }

    await interact(() => toggle.click());

    expect(container.textContent).toContain(
      "Shown here: which visitor, which version, and when. Not shown: IP address or browser",
    );
    expect(container.textContent).toContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(container.textContent).toContain("v1");
    expect(container.textContent).not.toContain("203.0.113");
  });

  it("says nobody has accepted yet when the list is empty", async () => {
    const container = await render(page());
    const toggle = byText<HTMLButtonElement>(container, "button", "Show who accepted");
    if (!toggle) {
      throw new Error("toggle button not found");
    }

    await interact(() => toggle.click());

    expect(container.textContent).toContain("Nobody has accepted this document yet.");
  });
});
