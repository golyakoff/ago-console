import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CalendarReadiness } from "../api/calendarApi.js";
import { FinishSetupBanner } from "./FinishSetupBanner.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `26-330`/`26-318`: unlike `BookingReadiness.tsx`, `FinishSetupBanner` takes its readiness straight as
 * a prop rather than fetching its own - so this test mounts it directly, with only the `MemoryRouter`
 * its `Link` needs, the same "no auth/permissions harness for a component with no fetch of its own"
 * shape `CalendarElsewhereNotice.test.tsx` would use if that component did not fetch its own data.
 */
const SITE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function notBookable(): CalendarReadiness[] {
  return [{ calendarId: "cal-1", calendarName: "Main", isBookable: false, preconditions: [] }];
}

function bookable(): CalendarReadiness[] {
  return [{ calendarId: "cal-1", calendarName: "Main", isBookable: true, preconditions: [] }];
}

function banner(readiness: CalendarReadiness[] | null, siteId: string): ReactNode {
  return (
    <MemoryRouter>
      <FinishSetupBanner readiness={readiness} siteId={siteId} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(async () => {
  await unmount();
});

describe("the finish-setup banner (26-330)", () => {
  it("renders nothing while readiness has not loaded yet", async () => {
    const container = await render(banner(null, SITE_A));

    expect(container.textContent).toBe("");
  });

  it("renders nothing once the calendar is bookable", async () => {
    const container = await render(banner(bookable(), SITE_A));

    expect(container.textContent).toBe("");
  });

  it("links into the setup guide while the calendar is not bookable", async () => {
    const container = await render(banner(notBookable(), SITE_A));

    const link = one<HTMLAnchorElement>(container, "a");
    expect(link.getAttribute("href")).toBe("/calendar/setup/guide");
    expect(link.textContent).toBe("Finish setting up booking");
  });

  it("hides for the rest of the tab once dismissed", async () => {
    const container = await render(banner(notBookable(), SITE_A));
    const dismiss = byText<HTMLButtonElement>(container, "button", "Dismiss");
    expect(dismiss).not.toBeNull();

    await interact(() => dismiss?.click());

    expect(container.textContent).toBe("");
  });

  // `26-330`'s own reason the dismissal is keyed per site: `switchTenancy` must never carry one
  // tenant's dismissal onto another tenant's still-unfinished setup in the same browser tab.
  it("does not carry a dismissal from one site onto another", async () => {
    const first = await render(banner(notBookable(), SITE_A));
    const dismiss = byText<HTMLButtonElement>(first, "button", "Dismiss");
    await interact(() => dismiss?.click());
    expect(first.textContent).toBe("");

    const second = await render(banner(notBookable(), SITE_B));

    expect(second.textContent).not.toBe("");
  });

  it("respects a dismissal already recorded for this site when it first mounts", async () => {
    sessionStorage.setItem(`ago-console:finish-setup-banner-dismissed:${SITE_A}`, "1");

    const container = await render(banner(notBookable(), SITE_A));

    expect(container.textContent).toBe("");
  });
});
