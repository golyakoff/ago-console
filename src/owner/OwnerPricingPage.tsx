import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOwnerPricing,
  publishPriceVersion,
  type OwnerPricedResource,
  type OwnerPricing,
} from "../api/ownerApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Panel } from "../components/Panel.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";

/** The same pre-answer/granted/refused shape `OwnerSitesPage`'s own `OwnerAccess` uses, for the
 * identical reason - there is no partial state to render while the server has not yet spoken. */
type OwnerPricingAccess = "unknown" | "granted" | "refused";

/**
 * `25-89`: a client-side tier-name map, translated here rather than reused from `BillingPage.tsx` -
 * that page reads a server-resolved `tierDisplayName` instead of mapping the wire key itself
 * (`BillingPage.tsx`'s own remarks), so there was no existing Russian value for "starter"/"growth" to
 * reuse without duplicating. `strings.ownerPricingTierStarter`/`Growth` hold the translation.
 */
function tierLabels(strings: ConsoleStrings): Record<string, string> {
  return {
    starter: strings.ownerPricingTierStarter,
    growth: strings.ownerPricingTierGrowth,
  };
}

/**
 * `25-20`: the platform owner's own price-list screen - `GET /api/v1/owner/pricing`. Every
 * currently-paid capability's price, read from the same configuration the billing code itself
 * charges from, so the owner can check the product's own numbers without opening the private
 * `ago-business` repository.
 *
 * **Seats and billing options stay read-only, exactly like `OwnerSitesPage`/`OwnerSiteDetailPage`
 * - `25-20`'s own original Scope for those two sections.** The `billingOptions` mechanism this page
 * reads (`IBillingOptionEntitlementProvider`) still carries no write path of its own
 * (`23-86`'s own Scope: "the deployment declares what an option turns on, never what it costs").
 *
 * **`25-43`: "Priced resources", further down, is this screen's first real write.** Every
 * code-registered price key, and a form (`PricedResourcePanel`) that publishes a new version for an
 * already-registered one - never a key the owner types into existence (the server's own
 * `PricedResourceKeys.IsKnown` guard is the actual enforcement; this page only ever renders the keys
 * `pricedResources` already lists). Mirrors `DocumentsPage.ConsentDocumentPanel`'s own toggle-to-
 * reveal-form/submit/refresh-via-callback shape - the identical "publish a new version" UI this
 * item's own Scope names as its precedent.
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
 *
 * **`25-89`: no longer hardcoded English** - reads `useStrings()` inside `App.tsx`'s own
 * `OwnerStringsProvider`, the identical change `OwnerSitesPage.tsx`'s own doc comment describes; see
 * that file and `OwnerStringsProvider.tsx` for the full reasoning.
 */
export function OwnerPricingPage() {
  const { user, logout } = useAuth();
  const { siteId } = usePermissions();
  const strings = useStrings();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerPricingAccess>("unknown");
  const [pricing, setPricing] = useState<OwnerPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `25-43`: extracted to a `load` this component can call again once a publish succeeds, the same
  // `DocumentsPage.load`/`onPublished` shape `ConsentDocumentPanel` already establishes for the
  // identical "publish, then re-read the now-current version" round trip. Unlike this page's own
  // original mount-only effect, a re-invocation after a publish has nothing to race against an
  // unmount for in practice (the publishing panel itself is what triggers the reload, from a still-
  // mounted page) - `DocumentsPage.load` carries no cancellation flag for the identical reason.
  const load = useCallback(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time this renders - the same "reaching here
      // is a wiring bug" reasoning `OwnerSitesPage`'s own effect states.
      return;
    }

    fetchOwnerPricing(accessToken)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        setAccess("granted");
        setPricing(outcome.pricing);
      })
      .catch((err: unknown) => {
        // Deliberately not folded into `refused` - "the API is broken" and "you may not see this"
        // are different facts, the identical split `OwnerSitesPage`'s own catch branch keeps.
        setError(err instanceof Error ? err.message : strings.ownerPricingLoadFailed);
      });
  }, [accessToken, strings]);

  useEffect(() => {
    load();
  }, [load]);

  // `25-42`: `SubscriptionTierBands.ComputeSeatPriceRub`'s own formula, restated here - a base
  // charge for the first `baseSeats` seats, then `pricePerExtraSeatRub` for each seat past that.
  // Kept as a plain function, not a method on `OwnerPricing`, for the same reason this file never
  // reaches for a shared "pricing math" module elsewhere: the one real computation this screen ever
  // needs is this one line, and a module for one line would be indirection with nothing behind it.
  const computeSeatTotalRub = (seats: number, seatPricing: OwnerPricing["seatPricing"]): number =>
    seatPricing.baseSeatPriceRub + Math.max(0, seats - seatPricing.baseSeats) * seatPricing.pricePerExtraSeatRub;

  // `25-42`: one row per concrete seat count, not one row per tier. `0012`'s own formula is not flat
  // within a tier (`25-29`'s own correction is exactly that a single "price per seat" was already
  // wrong the moment a tier spans more than `baseSeats` seats) - the Done-when this item states in
  // its own words ("a tenant reading the screen at 2, 3, 4, or 5 seats sees the correct total for
  // each") is answered directly by giving every seat count its own row and its own real total,
  // rather than inventing one number to stand in for a whole tier the way the old column did.
  interface SeatCountRow {
    tierKey: string;
    seats: number;
    totalRub: number;
  }

  const seatCountRows: SeatCountRow[] =
    pricing === null
      ? []
      : pricing.seatPricing.tiers.flatMap((tier) =>
          Array.from({ length: tier.maxSeats - tier.minSeats + 1 }, (_, i) => tier.minSeats + i).map((seats) => ({
            tierKey: tier.key,
            seats,
            totalRub: computeSeatTotalRub(seats, pricing.seatPricing),
          })),
        );

  const labels = tierLabels(strings);
  const tierColumns: TableColumn<SeatCountRow>[] = [
    { key: "tier", header: strings.ownerSitesColumnTier, render: (row) => labels[row.tierKey] ?? row.tierKey },
    { key: "seats", header: strings.ownerSitesColumnSeats, render: (row) => `${row.seats}`, align: "end" },
    {
      key: "price",
      header: strings.ownerPricingColumnTotal,
      render: (row) => `₽${row.totalRub.toFixed(2)}`,
      align: "end",
    },
  ];

  const billingOptionColumns: TableColumn<OwnerPricing["billingOptions"][number]>[] = [
    { key: "optionKey", header: strings.ownerPricingColumnOption, render: (row) => row.optionKey },
    { key: "moduleKey", header: strings.ownerPricingColumnTurnsOn, render: (row) => row.moduleKey ?? "—" },
    {
      key: "price",
      header: strings.ownerPricingColumnPrice,
      render: (row) => (row.priceRub === null ? strings.ownerPricingPriceNotConfigured : `₽${row.priceRub.toFixed(2)}`),
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
      pinnedItem={access === "granted" ? { to: "/owner", label: strings.navPlatformSites, end: false } : undefined}
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={siteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label={strings.ownerPricingOpeningLabel} />}

      {access === "refused" && (
        <>
          <PageHead title={strings.ownerPricingTitle} />
          <Alert tone="danger" title={strings.ownerNotAuthorizedTitle}>
            {strings.ownerPricingNotAuthorizedBody}
          </Alert>
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title={strings.ownerPricingTitle} />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && pricing !== null && (
        <>
          <PageHead
            title={strings.ownerPricingTitle}
            description={strings.ownerPricingDescription}
          />

          <Panel
            title={strings.ownerPricingSeatsTitle}
            // `25-42`: states the real formula in prose, not just in the table - a base charge for
            // the first `baseSeats` seats, then a per-seat charge beyond that, so the reader has the
            // shape of the calculation even before looking at any one row's own total.
            description={`${strings.ownerPricingSeatsDescPrefix}${pricing.seatPricing.freeSeatsIncluded}${strings.ownerPricingSeatsDescIncluded}${pricing.seatPricing.baseSeatPriceRub.toFixed(2)}${strings.ownerPricingSeatsDescForFirst}${pricing.seatPricing.baseSeats}${strings.ownerPricingSeatsDescSeatsThen}${pricing.seatPricing.pricePerExtraSeatRub.toFixed(2)}${strings.ownerPricingSeatsDescPerSeatBilled}${pricing.seatPricing.billingPeriodDays}${strings.ownerPricingSeatsDescDaysSuffix}`}
          >
            <Table
              caption={strings.ownerPricingSeatTableCaption}
              columns={tierColumns}
              rows={seatCountRows}
              rowKey={(row) => `${row.tierKey}-${row.seats}`}
            />
          </Panel>

          <Panel
            title={strings.ownerPricingBillingOptionsTitle}
            description={strings.ownerPricingBillingOptionsDescription}
          >
            {pricing.billingOptions.length === 0 ? (
              // `25-20`'s own honest finding, rendered rather than hidden: this deployment has no
              // billing option configured at all, and even one that were would carry no price - see
              // this component's own remarks above for why that is not a gap in this screen.
              <Alert tone="info">{strings.ownerPricingNoBillingOptions}</Alert>
            ) : (
              <Table
                caption={strings.ownerPricingBillingOptionsCaption}
                columns={billingOptionColumns}
                rows={pricing.billingOptions}
                rowKey={(row) => row.optionKey}
              />
            )}
          </Panel>

          <Panel
            title={strings.ownerPricingResourcesTitle}
            description={strings.ownerPricingResourcesDescription}
          >
            <div className="ago-stack">
              {pricing.pricedResources.map((resource) => (
                <PricedResourcePanel
                  key={resource.key}
                  resource={resource}
                  accessToken={accessToken}
                  onPublished={load}
                  strings={strings}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </AppShell>
  );
}

interface PricedResourcePanelProps {
  resource: OwnerPricedResource;
  accessToken: string;
  onPublished: () => void;
  strings: ConsoleStrings;
}

/**
 * `25-43`: one price key's own current figure, plus the form that publishes its next version -
 * mirrors `DocumentsPage.ConsentDocumentPanel`'s own toggle-to-reveal-form/submit/refresh-via-
 * callback shape, simplified to the one field this write actually takes (`amountRub`, not a
 * title/body pair). The form defaults closed once a version already exists, exactly like that
 * panel's own `formOpen`/`formVisible` split, for the identical reason: reading what is already
 * published should not require scrolling past an editable form aimed at replacing it.
 *
 * `25-89`: takes `strings` as a prop rather than calling `useStrings()` itself - this is a plain
 * child component rendered inside the page's own JSX (not a route), so threading the value down
 * once, the same way `resource`/`accessToken`/`onPublished` already arrive, avoids a second context
 * read for a value the parent already resolved.
 */
function PricedResourcePanel({ resource, accessToken, onPublished, strings }: PricedResourcePanelProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasCurrentVersion = resource.currentVersion !== null;
  const formVisible = !hasCurrentVersion || formOpen;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const amountRub = Number(draftAmount);
    if (draftAmount.trim().length === 0 || !Number.isFinite(amountRub) || amountRub < 0) {
      setValidationError(strings.ownerPricingAmountInvalid);
      return;
    }
    setValidationError(null);

    setSubmitting(true);
    try {
      const outcome = await publishPriceVersion(accessToken, resource.key, amountRub);
      if (outcome.status === "not-authorized") {
        setSubmitError(strings.ownerPricingResourceNotAuthorized);
        return;
      }
      if (outcome.status === "invalid" || outcome.status === "conflict") {
        setSubmitError(outcome.message);
        return;
      }

      setDraftAmount("");
      setSaved(true);
      // Collapses the form back behind its toggle once there is a new current version to show in
      // its place - `onPublished()` (below) is what re-fetches that version; this just stops the
      // form sitting open beside the read view it was reopened to replace.
      setFormOpen(false);
      onPublished();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : strings.ownerPricingPublishFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel quiet title={resource.label}>
      <div className="ago-stack">
        <div>
          <strong>{strings.ownerPricingCurrentPriceLabel}</strong>{" "}
          {hasCurrentVersion ? (
            `₽${resource.currentAmountRub.toFixed(2)} (${resource.currentVersion})`
          ) : (
            // `25-43`'s own second decision, rendered plainly rather than as an error: a registered
            // key with nothing published yet is the ordinary "built, not yet for sale" state.
            strings.ownerPricingNotYetForSale
          )}
        </div>

        {hasCurrentVersion && (
          <div>
            <Button type="button" variant="secondary" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? strings.cancelButton : strings.ownerPricingPublishButton}
            </Button>
          </div>
        )}

        {/* `25-43`: the outcome alerts live outside `formVisible`'s own block, unlike
         * `ConsentDocumentPanel`'s equivalent nesting - a successful publish for an already-published
         * key collapses the form (`setFormOpen(false)`) in the identical render pass that sets
         * `saved`, so an alert nested inside the form would be unmounted before it ever painted.
         * `ConsentDocumentPanel`'s own tests never catch this because they only ever publish a
         * document's *first* version, where `current === null` keeps the form open regardless of
         * `formOpen` - this screen's own equivalent case (publishing again for a key that already has
         * a version) makes the gap real, found while writing this panel's own tests. */}
        {validationError && <Alert tone="danger">{validationError}</Alert>}
        {submitError && <Alert tone="danger">{submitError}</Alert>}
        {saved && <Alert tone="success">{strings.ownerPricingPublished}</Alert>}

        {formVisible && (
          <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
            <Field label={strings.ownerPricingNewPriceLabel}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={0}
                  step="0.01"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={submitting}
                />
              )}
            </Field>

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? strings.ownerPricingPublishingLabel : strings.ownerPricingPublishButton}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}
