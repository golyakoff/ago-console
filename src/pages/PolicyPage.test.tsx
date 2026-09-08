import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyPage } from "./PolicyPage.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { render, renderSync, unmount } from "../testing/dom.js";

/**
 * `24-03`: `24-02`'s own Done-when, proven from a screen - "the current version is readable without
 * an account" and "a superseded version is still readable." This route mounts outside every provider
 * (`App.tsx`'s own comment on `/policies/:documentKey`), the same public shape `SignupPage.test.tsx`
 * already proves for `/signup` - nothing here requires `useAuth()`/`usePermissions()` to exist.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const documentsApi = vi.hoisted(() => ({ getCurrentDocument: vi.fn(), getDocumentVersion: vi.fn() }));

vi.mock("../api/documentsApi.js", () => documentsApi);

function app(documentKey: string, query = "") {
  return (
    <MemoryRouter initialEntries={[`/policies/${documentKey}${query}`]}>
      <Routes>
        <Route path="/policies/:documentKey" element={<PolicyPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * `23-100`: `Routes`' own `location` prop renders against an arbitrary location without touching
 * browser/memory history - re-rendering this with a different `documentKey` is a plain prop change on
 * `PolicyPage` (`App.tsx`'s route holds the same element regardless of which `documentKey` matched, so
 * this is the real shape a `DocumentsPage` "read as a visitor would" navigation produces), with none of
 * `<Link>`/`navigate()`'s own scheduling to account for. That is what makes `renderSync`
 * (`../testing/dom.js`) apply here exactly as it does for the five conversation-workspace panels'
 * identical fails-before checks.
 */
function appAt(documentKey: string) {
  return (
    <MemoryRouter>
      <Routes location={`/policies/${documentKey}`}>
        <Route path="/policies/:documentKey" element={<PolicyPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("reading a published document with no account", () => {
  it("shows the title and body of the current version", async () => {
    documentsApi.getCurrentDocument.mockResolvedValue({
      documentKey: "tenant-terms",
      version: "v2",
      sequence: 2,
      title: "Tenant Terms",
      body: "These are the terms.",
      publishedAt: "2026-03-12T10:00:00Z",
    });

    const container = await render(app("tenant-terms"));

    expect(documentsApi.getCurrentDocument).toHaveBeenCalledWith("tenant-terms");
    expect(container.textContent).toContain("Tenant Terms");
    expect(container.textContent).toContain("These are the terms.");
    expect(container.textContent).toContain("v2");
  });

  it("says the document could not be found for an unknown key, not a generic failure", async () => {
    documentsApi.getCurrentDocument.mockRejectedValue(
      new ApiProblemError("Document.NotFound", "No document found for key 'nope'.", 404),
    );

    const container = await render(app("nope"));

    expect(container.textContent).toContain("We couldn't find that document.");
  });

  it("says something usable when the failure is not a known document error", async () => {
    documentsApi.getCurrentDocument.mockRejectedValue(new TypeError("Failed to fetch"));

    const container = await render(app("tenant-terms"));

    expect(container.textContent).toContain("We couldn't load that document. Please try again.");
  });
});

/**
 * `23-37`: `DocumentsPage`'s own "read as a visitor would" links are the first real callers of a
 * `?version=` query on this route - proving it here, from a URL, rather than only from
 * `getDocumentVersion`'s own already-covered unit shape in `documentsApi.ts`.
 */
describe("reading a specific past version via ?version=", () => {
  it("calls getDocumentVersion, not getCurrentDocument, when a version is named in the URL", async () => {
    documentsApi.getDocumentVersion.mockResolvedValue({
      documentKey: "site-consent-contact-11111111111111111111111111111111",
      version: "v1",
      sequence: 1,
      title: "First draft",
      body: "The original words.",
      publishedAt: "2026-01-01T00:00:00Z",
    });

    const container = await render(app("site-consent-contact-11111111111111111111111111111111", "?version=v1"));

    expect(documentsApi.getDocumentVersion).toHaveBeenCalledWith(
      "site-consent-contact-11111111111111111111111111111111",
      "v1",
    );
    expect(documentsApi.getCurrentDocument).not.toHaveBeenCalled();
    expect(container.textContent).toContain("The original words.");
    expect(container.textContent).toContain("v1");
  });

  it("falls back to getCurrentDocument when no version is named", async () => {
    documentsApi.getCurrentDocument.mockResolvedValue({
      documentKey: "tenant-terms",
      version: "v2",
      sequence: 2,
      title: "Tenant Terms",
      body: "These are the terms.",
      publishedAt: "2026-03-12T10:00:00Z",
    });

    await render(app("tenant-terms"));

    expect(documentsApi.getDocumentVersion).not.toHaveBeenCalled();
    expect(documentsApi.getCurrentDocument).toHaveBeenCalledWith("tenant-terms");
  });
});

/**
 * `23-100`: `renderSync` (`../testing/dom.js`) commits without running any passive effect - the same
 * technique `ChannelIdentitiesPanel.test.tsx`'s identical describe block uses, and its doc comment
 * explains why that gap is what makes this a real fails-before check rather than "the same behaviour,
 * refactored": against the pre-`23-100` code the reset lived inside the effect, so this commit would
 * still carry the previous document's body; against the render-phase version the reset already
 * happened before it.
 */
describe("switching documents (23-100)", () => {
  it("clears the previous document's body before the fetch effect could have run", async () => {
    documentsApi.getCurrentDocument
      .mockResolvedValueOnce({
        documentKey: "tenant-terms",
        version: "v2",
        sequence: 2,
        title: "Tenant Terms",
        body: "These are the terms.",
        publishedAt: "2026-03-12T10:00:00Z",
      })
      .mockResolvedValueOnce({
        documentKey: "privacy-policy",
        version: "v1",
        sequence: 1,
        title: "Privacy Policy",
        body: "How we handle your data.",
        publishedAt: "2026-04-01T00:00:00Z",
      });

    const container = await render(appAt("tenant-terms"));
    expect(container.textContent).toContain("These are the terms.");

    renderSync(appAt("privacy-policy"));

    expect(container.textContent).not.toContain("These are the terms.");
    expect(container.textContent).not.toContain("Tenant Terms");
  });
});
