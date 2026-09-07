import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyPage } from "./PolicyPage.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { render, unmount } from "../testing/dom.js";

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
