import { describe, expect, it } from "vitest";
import { buildTenantNavSections } from "./consoleNav.js";
import { en } from "../i18n/en.js";

/**
 * `25-12`: pins the calendar nav's fill order in all three of `buildCalendarItems`'s branches, so a
 * future addition cannot silently land wherever it was appended (`buildCalendarItems` itself is not
 * exported - these go through `buildTenantNavSections`, the one function this file does export, and
 * read the resulting "calendar" section's own item routes).
 *
 * `25-17`: `/calendar/phone-reveals` is no longer one of this section's own routes - it moved to
 * Analytics (see `describe("buildTenantNavSections - analytics section")` below), correcting `25-12`'s
 * own placement. The full-access case's expected route list below drops it accordingly.
 */
describe("buildTenantNavSections - calendar section order", () => {
  function calendarRoutes(hasPermission: (permission: string) => boolean): (string | undefined)[] {
    const sections = buildTenantNavSections(hasPermission, en);
    const calendar = sections.find((section) => section.id === "calendar");
    return calendar ? calendar.items.map((item) => item.to) : [];
  }

  it("full-access (calendar:configure): leads with the operational screens, then the setup " +
    "dictionaries in fill order, Настройка after them, the merge audit trail last", () => {
    const routes = calendarRoutes((permission) => permission === "calendar:configure" || permission === "site:configure");

    expect(routes).toEqual([
      "/calendar/waiting",
      "/calendar/bookings",
      "/calendar/clients",
      "/calendar/masters",
      "/calendar/services",
      "/calendar/schedule",
      "/calendar/setup",
      "/calendar/customer-merges",
    ]);
  });

  it("admin without calendar:configure: the one muted entry, unaffected by the reorder", () => {
    const routes = calendarRoutes((permission) => permission === "site:configure");

    expect(routes).toEqual(["/calendar/waiting"]);
  });

  it("operator-limited (booking actions + customer:read, no calendar:configure, not admin): " +
    "matches the full-access branch's relative order for the same three screens", () => {
    const routes = calendarRoutes(
      (permission) => permission === "booking:confirm" || permission === "customer:read",
    );

    expect(routes).toEqual(["/calendar/waiting", "/calendar/bookings", "/calendar/clients"]);
  });

  it("operator with only customer:read: Bookings still precedes Clients", () => {
    const routes = calendarRoutes((permission) => permission === "customer:read");

    expect(routes).toEqual(["/calendar/bookings", "/calendar/clients"]);
  });
});

/**
 * `25-17`: "Показы телефонов" (`/calendar/phone-reveals`) moved from Calendar to Analytics - this
 * describes the new home. The gate is unchanged (`calendar:configure`, independent of `isAdmin`, so
 * it is asserted below for an operator who holds it without `site:configure` as well as for one who
 * holds neither) - only the section it renders under moved.
 */
describe("buildTenantNavSections - analytics section", () => {
  function analyticsRoutes(hasPermission: (permission: string) => boolean): (string | undefined)[] {
    const sections = buildTenantNavSections(hasPermission, en);
    const analytics = sections.find((section) => section.id === "analytics");
    return analytics ? analytics.items.map((item) => item.to) : [];
  }

  it("lists /calendar/phone-reveals for an operator who holds calendar:configure alone, not the tenant", () => {
    const routes = analyticsRoutes((permission) => permission === "calendar:configure");

    expect(routes).toEqual(["/analytics/me", "/calendar/phone-reveals"]);
  });

  it("lists /calendar/phone-reveals alongside the tenant-only analytics screens when both gates are held", () => {
    const routes = analyticsRoutes((permission) => permission === "calendar:configure" || permission === "site:configure");

    expect(routes).toEqual([
      "/analytics/me",
      "/analytics/site",
      "/analytics/conversion",
      "/analytics/tags",
      "/analytics/booking-flow",
      "/calendar/phone-reveals",
    ]);
  });

  it("omits /calendar/phone-reveals for the tenant when they themselves lack calendar:configure", () => {
    const routes = analyticsRoutes((permission) => permission === "site:configure");

    expect(routes).toEqual(["/analytics/me", "/analytics/site", "/analytics/conversion", "/analytics/tags", "/analytics/booking-flow"]);
  });
});
