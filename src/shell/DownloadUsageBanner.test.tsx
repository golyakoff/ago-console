import { afterEach, describe, expect, it } from "vitest";
import { render, unmount } from "../testing/dom.js";
import { DownloadUsageBanner } from "./DownloadUsageBanner.js";
import type { DownloadUsageStatusDto } from "../api/downloadUsageApi.js";

/**
 * `25-83`: `docs/backlog/25-83-*.md`'s own Done-when, rendered - "crossing the soft threshold...
 * shows a non-dismissable, warning-toned console banner." No API mock needed - the identical
 * "pure, prop-driven" shape `SuspensionBanner.test.tsx`'s own doc comment states for itself.
 */
describe("DownloadUsageBanner", () => {
  afterEach(async () => {
    await unmount();
  });

  const notCrossed: DownloadUsageStatusDto = {
    bytesOut: 10,
    softThresholdBytes: 100,
    hardThresholdBytes: 200,
    isSoftCrossed: false,
    isHardCrossed: false,
    isExempt: false,
  };

  it("renders nothing while the status has not loaded yet", async () => {
    const container = await render(<DownloadUsageBanner status={null} />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing below the soft threshold", async () => {
    const container = await render(<DownloadUsageBanner status={notCrossed} />);

    expect(container.textContent).toBe("");
  });

  it("shows the warning-toned banner once the soft threshold is crossed", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...notCrossed, bytesOut: 150, isSoftCrossed: true }} />,
    );

    expect(container.textContent).toContain("approaching");
    expect(container.textContent).toContain("Contact AGO");
    expect(container.querySelector(".ago-download-usage-banner")).not.toBeNull();
    expect(container.querySelector(".ago-download-usage-banner--blocked")).toBeNull();
  });

  it("shows the stronger, danger-toned banner once the hard threshold actually blocks downloads", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...notCrossed, bytesOut: 250, isSoftCrossed: true, isHardCrossed: true }} />,
    );

    expect(container.textContent).toContain("blocked");
    expect(container.querySelector(".ago-download-usage-banner--blocked")).not.toBeNull();
  });

  // `25-83`'s own decision: an exempt tenant is never actually blocked, so `isHardCrossed` reads
  // `false` from the API regardless of the raw byte count - this banner has no exemption logic of
  // its own to get wrong, it only ever reads the one flag the server already resolved.
  it("stays in the warning tone for an exempt site even past the raw hard-threshold byte count", async () => {
    const container = await render(
      <DownloadUsageBanner
        status={{ ...notCrossed, bytesOut: 500, isSoftCrossed: true, isHardCrossed: false, isExempt: true }}
      />,
    );

    expect(container.textContent).toContain("approaching");
    expect(container.querySelector(".ago-download-usage-banner--blocked")).toBeNull();
  });

  it("renders no interactive control at all", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...notCrossed, bytesOut: 150, isSoftCrossed: true }} />,
    );

    expect(container.querySelectorAll("button, a, input, textarea, select")).toHaveLength(0);
  });
});
