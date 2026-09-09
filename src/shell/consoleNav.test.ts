import { describe, expect, it } from "vitest";
import { buildTenantNavSections } from "./consoleNav.js";
import { en } from "../i18n/en.js";

/**
 * `25-12`: pins the calendar nav's fill order in all three of `buildCalendarItems`'s branches, so a
 * future addition cannot silently land wherever it was appended (`buildCalendarItems` itself is not
 * exported - these go through `buildTenantNavSections`, the one function this file does export, and
 * read the resulting "calendar" section's own item routes).
 */
describe("buildTenantNavSections - calendar section order", () => {
  function calendarRoutes(hasPermission: (permission: string) => boolean): (string | undefined)[] {
    const sections = buildTenantNavSections(hasPermission, en);
    const calendar = sections.find((section) => section.id === "calendar");
    return calendar ? calendar.items.map((item) => item.to) : [];
  }

  it("full-access (calendar:configure): leads with the operational screens, then the setup " +
    "dictionaries in fill order, Настройка after them, audit trails last", () => {
    const routes = calendarRoutes((permission) => permission === "calendar:configure" || permission === "site:configure");

    expect(routes).toEqual([
      "/calendar/waiting",
      "/calendar/bookings",
      "/calendar/clients",
      "/calendar/masters",
      "/calendar/services",
      "/calendar/schedule",
      "/calendar/setup",
      "/calendar/phone-reveals",
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
