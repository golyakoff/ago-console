import { describe, expect, it } from "vitest";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
} from "./ownerSites.js";

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});

describe("formatByteSize", () => {
  it("renders a small count as plain bytes", () => {
    expect(formatByteSize(0)).toBe("0 B");
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(1023)).toBe("1,023 B");
  });

  it("steps up through binary units", () => {
    expect(formatByteSize(1024)).toBe("1.0 KiB");
    expect(formatByteSize(1536)).toBe("1.5 KiB");
    expect(formatByteSize(1024 * 1024)).toBe("1.0 MiB");
    expect(formatByteSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GiB");
  });

  it("rounds towards zero, so a size never reads larger than it is", () => {
    // One byte short of a mebibyte. Rounding to the nearest would print "1.0 MiB" for something
    // that is not one - the same "never overstate" rule `formatElapsed` applies to durations.
    expect(formatByteSize(1024 * 1024 - 1)).toBe("1023.9 KiB");
    expect(formatByteSize(1024 * 1024 * 1.99)).toBe("1.9 MiB");
  });

  it("clamps a nonsensical negative rather than rendering it", () => {
    expect(formatByteSize(-1)).toBe("0 B");
  });
});

describe("the recent-activity window", () => {
  // These exist because the whole point of `12-02` returning `recentWindowDays` is that no client
  // hardcodes it. A regression here is a screen that confidently labels a windowed number with the
  // wrong window - the exact failure the server's contract set out to prevent.
  it("names whatever window the server reported", () => {
    expect(describeRecentWindow(30)).toBe("the last 30 days");
    expect(describeRecentWindow(7)).toBe("the last 7 days");
    expect(formatRecentMessagesHeader(30)).toBe("Messages (the last 30 days)");
    expect(formatRecentMessagesHeader(90)).toBe("Messages (the last 90 days)");
  });

  it("says day, singular, for a one-day window", () => {
    expect(describeRecentWindow(1)).toBe("the last day");
    expect(formatRecentMessagesHeader(1)).toBe("Messages (the last day)");
  });

  it("reports an empty last-activity as absence within the window, never as never", () => {
    expect(formatNoRecentActivity(30)).toBe("None in the last 30 days");
    expect(formatNoRecentActivity(30)).not.toMatch(/never/i);
  });
});
