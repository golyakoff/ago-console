import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOwnerPricing, type OwnerPricing } from "../api/ownerApi.js";
import { en } from "../i18n/en.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Panel } from "../components/Panel.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";

/** The same pre-answer/granted/refused shape `OwnerSitesPage`'s own `OwnerAccess` uses, for the
 * identical reason - there is no partial state to render while the server has not yet spoken. */
type OwnerPricingAccess = "unknown" | "granted" | "refused";

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
};

/**
 * `25-20`: the platform owner's own price-list screen - `GET /api/v1/owner/pricing`. Every
 * currently-paid capability's price, read from the same configuration the billing code itself
 * charges from, so the owner can check the product's own numbers without opening the private
 * `ago-business` repository.
 *
 * **Read-only, exactly like `OwnerSitesPage`/`OwnerSiteDetailPage`.** No edit control anywhere on
 * this screen - `25-20`'s own Scope: "this item does not build editing or a write path", and the
 * mechanism it reads from (`IBillingOptionEntitlementProvider`) carries no write path of its own
 * either (`23-86`'s own Scope: "the deployment declares what an option turns on, never what it
 * costs").
 *
 * **Gated the identical way as every other `/owner/*` screen** - `App.tsx`'s `RequireAuth` checks
 * only "is there an OIDC session"; the route does not decide who the owner is, because
 * `RequirePlatformOwner` on `GET /api/v1/owner/pricing` already does, authoritatively, per request.
 * This component renders whatever that policy answers, the same three-state
 * `unknown`/`granted`/`refused` shape `OwnerSitesPage`'s own `OwnerAccess` establishes - copied
 * rather than reused as a shared type only because the two pages' granted content differs completely
 * and a shared "access" type would buy nothing beyond the three string literals themselves.
 *
 * **The `billingOptions` section is honestly, deliberately empty today, and says so.** No
 * `BillingOptionEntitlements:*` key is configured on this deployment, and even a deployment that
 * configured one would only be declaring *what module it turns on* - no configuration key for a
 * billing option's own *price* exists anywhere in this codebase yet
 * (`GetPricingForOwnerHandler`'s own remarks, `ago-chat`). This screen shows that plainly rather than
 * omitting the section or inventing a number - `CLAUDE.md`: "a screen that honestly shows 'not yet
 * configured' for a price nothing has set is the correct outcome."
 */
export function OwnerPricingPage() {
  const { user, logout } = useAuth();
  const { siteId } = usePermissions();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerPricingAccess>("unknown");
  const [pricing, setPricing] = useState<OwnerPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time this renders - the same "reaching here
      // is a wiring bug" reasoning `OwnerSitesPage`'s own effect states.
      return;
    }

    let cancelled = false;
    fetchOwnerPricing(accessToken)
      .then((outcome) => {
        if (cancelled) {
          return;
        }

        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        setAccess("granted");
        setPricing(outcome.pricing);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Deliberately not folded into `refused` - "the API is broken" and "you may not see this"
          // are different facts, the identical split `OwnerSitesPage`'s own catch branch keeps.
          setError(err instanceof Error ? err.message : "Failed to load the platform price list.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const tierColumns: TableColumn<OwnerPricing["seatPricing"]["tiers"][number]>[] = [
    { key: "tier", header: "Tier", render: (row) => TIER_LABELS[row.key] ?? row.key },
    {
      key: "seats",
      header: "Seats",
      render: (row) => (row.minSeats === row.maxSeats ? `${row.minSeats}` : `${row.minSeats}–${row.maxSeats}`),
      align: "end",
    },
    {
      key: "price",
      header: "Price per seat",
      // Every tier shares the identical price (`SubscriptionTierBands`'s own "no per-band discount"),
      // so this column ignores its own row entirely and reads the one value that applies to all of
      // them - `pricing` is never actually `null` while this table renders (it is only ever built
      // inside the `pricing !== null` branch below), but the type stays nullable since these columns
      // are declared once, above that branch.
      render: () => (pricing === null ? "" : `₽${pricing.seatPricing.pricePerSeatRub.toFixed(2)}`),
      align: "end",
    },
  ];

  const billingOptionColumns: TableColumn<OwnerPricing["billingOptions"][number]>[] = [
    { key: "optionKey", header: "Option", render: (row) => row.optionKey },
    { key: "moduleKey", header: "Turns on", render: (row) => row.moduleKey ?? "—" },
    {
      key: "price",
      header: "Price",
      render: (row) => (row.priceRub === null ? "Not configured" : `₽${row.priceRub.toFixed(2)}`),
      align: "end",
    },
  ];

  return (
    <AppShell
      // `25-20`: no tenant-scoped nav sections, unconditionally - unlike `OwnerSitesPage` (which
      // draws them when this identity also happens to hold an operator seat elsewhere), this screen
      // is a single flat read with no further navigation of its own to offer.
      sections={[]}
      // `4-06`(console): the price list is itself reached from "Platform sites"' own pinned link
      // (`OwnerSitesPage`'s new `aside` link) - it does not add a second pinned entry of its own.
      // "Platform sites" stays highlighted while here, the same `end: false` `OwnerSiteDetailPage`
      // already uses for its own sub-route of the identical pinned link.
      pinnedItem={access === "granted" ? { to: "/owner", label: en.navPlatformSites, end: false } : undefined}
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={siteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening the platform price list…" />}

      {access === "refused" && (
        <>
          <PageHead title="Price list" />
          <Alert tone="danger" title="Not authorized">
            This view is not available to you. The server refused the request, so no pricing was
            loaded.
          </Alert>
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title="Price list" />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && pricing !== null && (
        <>
          <PageHead
            title="Price list"
            description="Every currently-paid capability and its price, read from this deployment's own billing configuration - not retyped from anywhere else. Read-only - this screen shows numbers, it changes nothing."
          />

          <Panel
            title="Seats"
            description={`Every site starts with ${pricing.seatPricing.freeSeatsIncluded} seats included, no charge. Buying more resolves to one of the two bands below, billed every ${pricing.seatPricing.billingPeriodDays} days.`}
          >
            <Table
              caption="Seat pricing by tier"
              columns={tierColumns}
              rows={pricing.seatPricing.tiers}
              rowKey={(row) => row.key}
            />
          </Panel>

          <Panel
            title="Other billing options"
            description="Channel entitlements, AI add-ons, and storage pricing beyond the included allowance."
          >
            {pricing.billingOptions.length === 0 ? (
              // `25-20`'s own honest finding, rendered rather than hidden: this deployment has no
              // billing option configured at all, and even one that were would carry no price - see
              // this component's own remarks above for why that is not a gap in this screen.
              <Alert tone="info">
                No billing options are configured on this deployment yet. This deployment's own
                configuration can declare what a billing option turns on (which module it enables),
                but this codebase has no configuration for what any of them cost - that number, when
                one exists, will appear here rather than being invented.
              </Alert>
            ) : (
              <Table
                caption="Other billing options and their prices"
                columns={billingOptionColumns}
                rows={pricing.billingOptions}
                rowKey={(row) => row.optionKey}
              />
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
