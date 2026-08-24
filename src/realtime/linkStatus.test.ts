import { describe, expect, it } from "vitest";
import { linkStatusOf } from "./linkStatus.js";

describe("linkStatusOf", () => {
  it("reports a healthy connection as live", () => {
    const status = linkStatusOf("connected", false);

    expect(status.state).toBe("connected");
    expect(status.label).toBe("Live");
    expect(status.healthy).toBe(true);
  });

  it("reports the server's own drain hint as a degraded, still-usable connection", () => {
    // The `"Reconnect"` push from `ConnectionDrainCoordinator` - the one degradation a browser can
    // honestly observe. The link is still up, so sending still works.
    const status = linkStatusOf("connected", true);

    expect(status.state).toBe("draining");
    expect(status.label).toBe("Server restarting");
    expect(status.healthy).toBe(true);
  });

  it("lets reconnecting outrank a stale drain hint - the drop already happened", () => {
    expect(linkStatusOf("reconnecting", true).state).toBe("reconnecting");
    expect(linkStatusOf("disconnected", true).state).toBe("disconnected");
  });

  it("distinguishes all five states by word, not only by colour", () => {
    const labels = [
      linkStatusOf("connecting", false),
      linkStatusOf("connected", false),
      linkStatusOf("connected", true),
      linkStatusOf("reconnecting", false),
      linkStatusOf("disconnected", false),
    ].map((status) => status.label);

    expect(new Set(labels).size).toBe(5);
  });

  it("marks reconnecting and disconnected as not healthy, so the workspace can say so", () => {
    expect(linkStatusOf("reconnecting", false).healthy).toBe(false);
    expect(linkStatusOf("disconnected", false).healthy).toBe(false);
    expect(linkStatusOf("connecting", false).healthy).toBe(false);
  });

  it("always carries a sentence of detail, never a bare enum name", () => {
    for (const state of ["connecting", "connected", "reconnecting", "disconnected"] as const) {
      expect(linkStatusOf(state, false).detail.length).toBeGreaterThan(20);
    }
  });
});
