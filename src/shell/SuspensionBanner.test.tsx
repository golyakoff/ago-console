import { afterEach, describe, expect, it } from "vitest";
import { render, unmount } from "../testing/dom.js";
import { SuspensionBanner } from "./SuspensionBanner.js";

/**
 * `25-70`: `docs/backlog/22-08-*.md`'s own Scope, rendered - "the console says the account is
 * suspended, since when, until when, and what to do about it." No API mock needed: this component
 * takes the already-fetched `SiteSuspensionStatusDto` as a prop (`useSiteSuspensionStatus.ts` is the
 * piece that talks to the network, and is not exercised here), the same "pure, prop-driven, no context
 * read of its own" shape `AppShell.tsx`'s own doc comment argues for `PublicDemoNotice`.
 */
describe("SuspensionBanner", () => {
  afterEach(async () => {
    await unmount();
  });

  it("renders nothing while the status has not loaded yet", async () => {
    const container = await render(<SuspensionBanner status={null} />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing for a site that is not suspended", async () => {
    const container = await render(<SuspensionBanner status={{ isSuspended: false, since: null, until: null }} />);

    expect(container.textContent).toBe("");
  });

  it("shows the suspension, since, until and the contact line for a suspended site", async () => {
    const container = await render(
      <SuspensionBanner
        status={{ isSuspended: true, since: "2026-09-01T00:00:00Z", until: "2026-09-15T00:00:00Z" }}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("suspended");
    expect(text).toContain("2026"); // the formatted since/until instants
    expect(text).toContain("Contact AGO");
  });

  // `25-70`'s own read-only scope: no button, link or form anywhere in this banner - the platform
  // owner's console is the only place that can lift or extend a suspension.
  it("renders no interactive control at all", async () => {
    const container = await render(
      <SuspensionBanner
        status={{ isSuspended: true, since: "2026-09-01T00:00:00Z", until: "2026-09-15T00:00:00Z" }}
      />,
    );

    expect(container.querySelectorAll("button, a, input, textarea, select")).toHaveLength(0);
  });
});
