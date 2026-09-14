import { afterEach, describe, expect, it } from "vitest";
import { flush, interact, one, render, unmount } from "../testing/dom.js";
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
    // `25-84`: the defaults every `25-83` test above means without saying so - manual mode, nothing
    // outstanding, no cap reached. `outstandingOverageRub: null` is what keeps the pay button absent
    // from every one of them, including the "renders no interactive control at all" case below.
    billingMode: "Manual",
    outstandingOverageBytes: 0,
    outstandingOverageRub: null,
    overageSettledRub: 0,
    autoBillCapRub: null,
    isAtAutoBillCap: false,
  };

  /** `25-84`: a tenant blocked at the hard threshold, on the manual path, with 2 GiB outstanding at
   * the shipped 100 RUB/GB price. */
  const blockedAndPayable: DownloadUsageStatusDto = {
    ...notCrossed,
    bytesOut: 3221225472,
    isSoftCrossed: true,
    isHardCrossed: true,
    outstandingOverageBytes: 2147483648,
    outstandingOverageRub: 200,
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

  it("renders no interactive control at all in the soft-warning state", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...notCrossed, bytesOut: 150, isSoftCrossed: true }} />,
    );

    expect(container.querySelectorAll("button, a, input, textarea, select")).toHaveLength(0);
  });

  // `25-84`: the one control this banner ever renders - the tenant paying for egress they have
  // already used, which is their own decision, not a control over a limit (`25-83` owns those and
  // they stay the platform owner's). Each test below removes exactly one of the four conditions the
  // component requires, so a pass is evidence about that condition and nothing else.

  it("offers the manual path's own checkout, showing the server's own amount, once blocked", async () => {
    const container = await render(
      <DownloadUsageBanner status={blockedAndPayable} onPay={() => Promise.resolve()} />,
    );

    const button = one<HTMLButtonElement>(container, "button");
    expect(button.textContent).toContain("200.00");
  });

  it("offers nothing while only the soft threshold is crossed", async () => {
    const container = await render(
      <DownloadUsageBanner
        status={{ ...blockedAndPayable, isHardCrossed: false }}
        onPay={() => Promise.resolve()}
      />,
    );

    expect(container.querySelector("button")).toBeNull();
  });

  it("offers nothing to an auto-billed tenant, who is never blocked by this in the first place", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...blockedAndPayable, billingMode: "AutoBill" }} onPay={() => Promise.resolve()} />,
    );

    expect(container.querySelector("button")).toBeNull();
  });

  it("explains the monthly ceiling instead of offering a purchase that would be refused", async () => {
    const container = await render(
      <DownloadUsageBanner
        status={{ ...blockedAndPayable, isAtAutoBillCap: true, autoBillCapRub: 100 }}
        onPay={() => Promise.resolve()}
      />,
    );

    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("maximum overage");
  });

  it("offers nothing when no per-gigabyte price has ever been published", async () => {
    const container = await render(
      <DownloadUsageBanner status={{ ...blockedAndPayable, outstandingOverageRub: null }} onPay={() => Promise.resolve()} />,
    );

    expect(container.querySelector("button")).toBeNull();
  });

  it("offers nothing in a shell that supplied no checkout action at all", async () => {
    const container = await render(<DownloadUsageBanner status={blockedAndPayable} />);

    expect(container.querySelector("button")).toBeNull();
  });

  it("says so when starting the checkout fails, rather than leaving a dead button", async () => {
    const container = await render(
      <DownloadUsageBanner
        status={blockedAndPayable}
        onPay={() => Promise.reject(new Error("network"))}
      />,
    );

    const button = one<HTMLButtonElement>(container, "button");
    // `interact` wraps the click in React's own `act` and flushes - the same helper every other
    // click-then-assert test in this console uses, rather than a bare `click()` plus a timer.
    await interact(() => button.click());
    await flush();

    expect(container.textContent).toContain("Could not start the payment");
  });
});
